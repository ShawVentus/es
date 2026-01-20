import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRecoilValue } from 'recoil';
import { toast, Toaster } from 'react-hot-toast';
import { useTheme, getThemeColors } from '../hooks/useTheme';
// Header 已全局集成，此处移除
import { useFinanceAuth } from '../hooks/useFinanceAuth';
// 其他 hooks
import { useDatasets } from '../hooks/useDatasets';
import { selectedDataForModelState } from '../store/filesStore';
import { getDatasetPreview, type DatasetPreview } from '../api/dataset';
import {
  fitARIMA, fitARMA, fitGARCH, fitARCH, fitVAR, fitVECM,
  type ModelResult
} from '../api/models';
import { generateReport } from '../api/reports';
import { runUnivariateTests, runMultivariateTests, getDescriptiveStats } from '../api/statistics';

/**
 * 统一的日期列识别函数
 * 识别规则：列名包含 date/time/datetime/timestamp 或为中文"日期"
 */
const isDateColumn = (columnName: string): boolean => {
  const nameLower = columnName.toLowerCase();
  return nameLower.includes('date') ||
    nameLower.includes('time') ||
    columnName === '日期';
};

interface ModelType {
  id: string;
  name: string;
  description: string;
  icon: string;
  parameters: string[];
}

interface ColumnData {
  name: string;
  selected: boolean;
  previewData: (string | number)[];
}

interface ImportedData {
  dataId: string;
  dataName: string;
  category: string;
  columns: ColumnData[];
  dateColumn: string;
}

export default function ModelBuilding() {
  const auth = useFinanceAuth();
  const { theme } = useTheme();
  const colors = getThemeColors(theme);
  const navigate = useNavigate();

  // Recoil State
  // 使用 useDatasets 确保数据自动加载
  const { datasets: datasetFiles } = useDatasets();
  const preSelectedData = useRecoilValue(selectedDataForModelState);

  const [selectedDataId, setSelectedDataId] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [availableColumns, setAvailableColumns] = useState<ColumnData[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [importedDataList, setImportedDataList] = useState<ImportedData[]>([]);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [dataStartDate, setDataStartDate] = useState('');
  const [dataEndDate, setDataEndDate] = useState('');
  const [totalDataRows, setTotalDataRows] = useState(0);

  // ========== 模型参数State ==========
  const [arimaParams, setArimaParams] = useState({ p: 2, d: 1, q: 1 });
  const [armaParams, setArmaParams] = useState({ p: 2, q: 1 });
  const [garchParams, setGarchParams] = useState({ p: 1, q: 1, dist: 'normal' as 'normal' | 't' | 'ged' });
  const [archParams, setArchParams] = useState({ q: 1, dist: 'normal' as 'normal' | 't' | 'ged' });
  const [varParams, setVarParams] = useState({ lags: 2 });
  const [vecmParams, setVecmParams] = useState({ coint_rank: 1, lags: 2 });

  // Initialize with pre-selected data if available
  useEffect(() => {
    console.log('🔍 preSelectedData:', preSelectedData);
    console.log('🔍 localStorage:', localStorage.getItem('finance_selectedDataForModel'));

    if (preSelectedData) {
      console.log('✅ 使用 Recoil 状态:', preSelectedData.filename);
      handleDataSelect(preSelectedData.filename);
    }
    // Fallback to localStorage for refresh persistence (optional, keeping compatible with current flow)
    else {
      const savedDataStr = localStorage.getItem('finance_selectedDataForModel');
      if (savedDataStr) {
        try {
          const savedData = JSON.parse(savedDataStr);
          // Note: savedData structure might vary, strictly we expect {id, ...} or {filename, ...}
          const filename = savedData.filename || savedData.id;
          if (filename) handleDataSelect(filename);
          localStorage.removeItem('finance_selectedDataForModel');
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, [preSelectedData]);

  const itemsPerPage = 6;

  const modelTypes: ModelType[] = [
    {
      id: 'arma',
      name: 'ARMA模型',
      description: '自回归移动平均模型，适用于平稳时间序列的建模与预测',
      icon: 'ri-line-chart-line',
      parameters: ['AR阶数(p)', 'MA阶数(q)', '常数项']
    },
    {
      id: 'arima',
      name: 'ARIMA模型',
      description: '差分自回归移动平均模型，适用于非平稳序列',
      icon: 'ri-arrow-up-down-line',
      parameters: ['AR阶数(p)', '差分阶数(d)', 'MA阶数(q)']
    },
    {
      id: 'arch',
      name: 'ARCH模型',
      description: '自回归条件异方差模型，波动率建模基础模型',
      icon: 'ri-pulse-line',
      parameters: ['ARCH阶数(q)', '分布假设']
    },
    {
      id: 'garch',
      name: 'GARCH模型',
      description: '广义自回归条件异方差模型，用于波动率建模',
      icon: 'ri-stock-line',
      parameters: ['ARCH阶数(p)', 'GARCH阶数(q)', '分布类型']
    },
    {
      id: 'var',
      name: 'VAR模型',
      description: '向量自回归模型，用于多变量时间序列分析',
      icon: 'ri-git-branch-line',
      parameters: ['滞后阶数', '变量选择', '趋势项']
    },
    {
      id: 'vecm',
      name: 'VECM模型',
      description: '向量误差修正模型，用于协整关系分析',
      icon: 'ri-links-line',
      parameters: ['协整秩', '滞后阶数', '趋势设定']
    }
  ];

  // Filter datasets
  const filteredData = datasetFiles.filter(item =>
    (item.filename || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.category || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleDataSelect = async (filename: string) => {
    setSelectedDataId(filename);
    setLoadingColumns(true);
    setShowColumnSelector(true);
    setAvailableColumns([]);

    try {
      const preview: DatasetPreview = await getDatasetPreview(auth, filename);

      // Transform preview columns to checkable columns
      // backend returns columns array: ['Date', 'Open', ...]
      // previewData needs to extract column data from head_rows

      const newColumns: ColumnData[] = preview.columns
        .map((colName, colIndex) => {
          // Extract first 10 rows for this column for preview
          const colPreviewData = preview.head_rows.slice(0, 10).map(row => {
            const val = row[colIndex];
            return typeof val === 'string' || typeof val === 'number' ? val : String(val);
          });

          return {
            name: colName,
            selected: false, // Default to not selected
            previewData: colPreviewData
          };
        })
        .filter((col, index, self) => {
          // 过滤重复字段名
          const isDuplicate = self.findIndex(c => c.name === col.name) !== index;
          if (isDuplicate) return false;

          // 过滤全空字段（所有预览数据都是空的）
          const isAllEmpty = col.previewData.every(val =>
            val === null || val === undefined || val === '' || val === 'null' || val === 'undefined'
          );
          if (isAllEmpty) return false;

          // 过滤重复数据（所有值都相同的字段）
          // 检查预览数据中是否所有非空值都相同
          const nonEmptyValues = col.previewData.filter(val =>
            val !== null && val !== undefined && val !== '' && val !== 'null' && val !== 'undefined'
          );

          if (nonEmptyValues.length > 1) {
            // 将所有值转换为字符串进行比较
            const firstValue = String(nonEmptyValues[0]);
            const isAllSame = nonEmptyValues.every(val => String(val) === firstValue);
            if (isAllSame) return false;
          }

          return true;
        });

      // 将日期列置顶并默认选中
      const dateColumnIndex = newColumns.findIndex(col => isDateColumn(col.name));

      let sortedColumns = [...newColumns];
      if (dateColumnIndex >= 0) {
        // 将日期列移到第一位
        const [dateColumn] = sortedColumns.splice(dateColumnIndex, 1);
        // 设置为默认选中
        dateColumn.selected = true;
        sortedColumns.unshift(dateColumn);
      }

      setAvailableColumns(sortedColumns);
      setTotalDataRows(preview.total_rows || preview.meta.rows || 0);

      // Extract date range from date column if exists
      const dateColIndex = preview.columns.findIndex(col =>
        col.toLowerCase().includes('date') || col.toLowerCase().includes('time') || col === '日期'
      );
      if (dateColIndex >= 0 && preview.head_rows.length > 0) {
        const firstDate = preview.head_rows[0][dateColIndex];
        // Try to use tail_rows, fallback to last head_row
        const lastDate = preview.tail_rows?.[preview.tail_rows.length - 1]?.[dateColIndex]
          || preview.head_rows[preview.head_rows.length - 1]?.[dateColIndex]
          || firstDate;
        setDataStartDate(String(firstDate));
        setDataEndDate(String(lastDate));
      } else {
        setDataStartDate('');
        setDataEndDate('');
      }
    } catch (err) {
      console.error(err);
      toast.error('无法加载数据列信息');
      setShowColumnSelector(false);
    } finally {
      setLoadingColumns(false);
    }
  };

  const handleColumnToggle = (columnName: string) => {
    setAvailableColumns(prev => {
      const targetCol = prev.find(col => col.name === columnName);
      if (!targetCol) return prev;

      // 日期列不可取消选择
      if (isDateColumn(columnName)) {
        toast.error('日期列为必选字段，不可取消');
        return prev;
      }

      // 如果要取消选择，直接允许
      if (targetCol.selected) {
        return prev.map(col =>
          col.name === columnName ? { ...col, selected: false } : col
        );
      }

      // 如果要选择，检查非日期列的限制
      const nonDateSelected = prev.filter(col => col.selected && !isDateColumn(col.name)).length;

      if (nonDateSelected >= 2) {
        toast.error('除日期列外，最多只能选择2个特征字段');
        return prev;
      }

      return prev.map(col =>
        col.name === columnName ? { ...col, selected: true } : col
      );
    });
  };

  const handleConfirmImport = () => {
    const data = datasetFiles.find(d => d.filename === selectedDataId);
    if (!data) return;

    const selectedColumns = availableColumns.filter(col => col.selected);
    if (selectedColumns.length === 0) {
      toast.error('请至少选择一个数据列');
      return;
    }

    const dateCol = availableColumns.find(c => isDateColumn(c.name) && c.selected);

    const newImportedData: ImportedData = {
      dataId: data.filename,
      dataName: data.filename,
      category: data.category || 'Uncategorized',
      columns: selectedColumns,
      dateColumn: dateCol ? dateCol.name : (selectedColumns[0]?.name || '')
    };

    setImportedDataList(prev => [...prev, newImportedData]);
    setShowColumnSelector(false);
    setSelectedDataId('');
    setAvailableColumns([]);
    toast.success('数据导入成功');
  };

  const handleCancelImport = () => {
    setShowColumnSelector(false);
    setSelectedDataId('');
    setAvailableColumns([]);
  };

  const handleClearImportedData = () => {
    toast((t) => (
      <div className="flex flex-col gap-3">
        <p className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>确定要清空所有已导入的数据吗？</p>
        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>此操作不可撤销</p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setImportedDataList([]);
              setDataStartDate('');
              setDataEndDate('');
              setTotalDataRows(0);
              toast.dismiss(t.id);
              toast.success('已清空所有数据');
            }}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 cursor-pointer transition-colors"
          >
            确认清空
          </button>
          <button
            onClick={() => toast.dismiss(t.id)}
            className={`px-4 py-2 ${theme === 'dark' ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'} text-sm font-medium rounded-lg cursor-pointer transition-colors`}
          >
            取消
          </button>
        </div>
      </div>
    ), {
      duration: Infinity,
      position: 'top-center'
    });
  };

  const handleStartBuilding = async () => {
    if (importedDataList.length === 0) {
      toast.error('请先导入数据');
      return;
    }
    if (!selectedModel) {
      toast.error('请选择模型类型');
      return;
    }

    setIsBuilding(true);

    try {
      // 1. 确定value_col（第一个非日期列）
      const firstData = importedDataList[0];
      const valueColumn = firstData.columns.find(
        col => col.selected && col.name !== firstData.dateColumn
      )?.name;

      if (!valueColumn) {
        toast.error('请至少选择一个数据列');
        setIsBuilding(false);
        return;
      }

      // 1.1 判断是单变量还是多变量模型
      const isMultivariate = selectedModel === 'var' || selectedModel === 'vecm';

      // 1.2 运行统计检验
      toast.loading('正在运行统计检验...', { id: 'building' });
      let testResults: any;
      let statsResults: any;

      if (isMultivariate) {
        // 多变量检验
        testResults = await runMultivariateTests(auth, {
          filenames: importedDataList.map(d => d.dataName),
          value_col: valueColumn,
          date_col: firstData.dateColumn
        });
        // 多变量描述性统计（使用第一个变量的统计，报告生成器会自动处理多变量格式）
        statsResults = await getDescriptiveStats(auth,
          firstData.dataName,
          valueColumn
        );
      } else {
        // 单变量检验
        testResults = await runUnivariateTests(auth, {
          filename: firstData.dataName,
          value_col: valueColumn
        });
        statsResults = await getDescriptiveStats(auth,
          firstData.dataName,
          valueColumn
        );
      }

      let result: ModelResult;

      // 2. 根据模型类型调用对应API（传递日期范围）
      toast.loading('正在拟合模型...', { id: 'building' });
      switch (selectedModel) {
        case 'arima':
          result = await fitARIMA(auth, {
            filename: firstData.dataName,
            value_col: valueColumn,
            order: [arimaParams.p, arimaParams.d, arimaParams.q],
            start_date: dataStartDate || undefined,
            end_date: dataEndDate || undefined,
            date_col: firstData.dateColumn
          });
          break;

        case 'arma':
          result = await fitARMA(auth, {
            filename: firstData.dataName,
            value_col: valueColumn,
            order: [armaParams.p, armaParams.q],
            start_date: dataStartDate || undefined,
            end_date: dataEndDate || undefined,
            date_col: firstData.dateColumn
          });
          break;

        case 'garch':
          result = await fitGARCH(auth, {
            filename: firstData.dataName,
            value_col: valueColumn,
            garch_order: [garchParams.p, garchParams.q],
            distribution: garchParams.dist,
            start_date: dataStartDate || undefined,
            end_date: dataEndDate || undefined,
            date_col: firstData.dateColumn
          });
          break;

        case 'arch':
          result = await fitARCH(auth, {
            filename: firstData.dataName,
            value_col: valueColumn,
            garch_order: [archParams.q],
            distribution: archParams.dist,
            start_date: dataStartDate || undefined,
            end_date: dataEndDate || undefined,
            date_col: firstData.dateColumn
          });
          break;

        case 'var':
          // VAR需要多个数据文件
          if (importedDataList.length < 2) {
            toast.error('VAR模型至少需要导入2个数据集');
            setIsBuilding(false);
            return;
          }
          result = await fitVAR(auth, {
            filenames: importedDataList.map(d => d.dataName),
            value_col: valueColumn,
            lags: varParams.lags,
            include_granger: true,
            include_irf: true,
            start_date: dataStartDate || undefined,
            end_date: dataEndDate || undefined,
            date_col: firstData.dateColumn
          });
          break;

        case 'vecm':
          // VECM需要多个数据文件
          if (importedDataList.length < 2) {
            toast.error('VECM模型至少需要导入2个数据集');
            setIsBuilding(false);
            return;
          }
          result = await fitVECM(auth, {
            filenames: importedDataList.map(d => d.dataName),
            value_col: valueColumn,
            coint_rank: vecmParams.coint_rank,
            lags: vecmParams.lags,
            include_granger: true,
            include_irf: true,
            start_date: dataStartDate || undefined,
            end_date: dataEndDate || undefined,
            date_col: firstData.dateColumn
          });
          break;

        default:
          toast.error('未知的模型类型');
          setIsBuilding(false);
          return;
      }

      // 3. 检查结果
      if (!result.success) {
        toast.error(result.message || '模型构建失败');
        setIsBuilding(false);
        return;
      }

      // 4. 存储结果到localStorage供报告页面使用
      localStorage.setItem('finance_latestModelResult', JSON.stringify({
        ...result,
        dataSource: firstData.dataName,
        modelName: modelTypes.find(m => m.id === selectedModel)?.name || selectedModel
      }));

      // 5. 生成报告
      if (result.report_id) {
        toast.loading('模型拟合完成，正在生成报告...', { id: 'building' });

        const reportResult = await generateReport(auth, {
          report_id: result.report_id,
          preprocessing_record: {
            missing_count: 0,
            outlier_count: 0,
            log_applied: false,
            diff_order: 0,
            final_length: testResults.n_observations || 0
          },
          test_results: testResults.tests || {},
          descriptive_stats: statsResults.statistics || {},
          data_source_info: {
            name: firstData.dataName,
            source: 'user_upload',
            date_range: `${dataStartDate || 'N/A'} ~ ${dataEndDate || 'N/A'}`,
            original_count: testResults.n_observations || 0
          },
          model_type: selectedModel.toUpperCase()
        });

        if (!reportResult.success) {
          throw new Error(reportResult.message || '报告生成失败');
        }

        localStorage.setItem('finance_latestReportId', result.report_id);

        // 延迟显示下一个状态，让用户看到"正在生成报告"
        await new Promise(resolve => setTimeout(resolve, 1500));
        toast.success('报告生成完成！正在跳转...', { id: 'building' });

        setTimeout(() => {
          navigate('/report-analysis');
        }, 1500);
      } else {
        toast.success('模型构建成功！正在跳转到报告页面...', { id: 'building' });
        setTimeout(() => {
          navigate('/report-analysis');
        }, 1500);
      }

    } catch (error: any) {
      console.error('建模或报告生成失败:', error);
      toast.error(error.message || '操作失败，请检查数据和参数', { id: 'building' });
    } finally {
      // 确保状态重置（跳转后组件卸载会自动清理）
      setIsBuilding(false);
    }
  };

  const getHighlightStyle = () => {
    if (theme === 'light') {
      return 'bg-gray-900 text-white';
    } else if (theme === 'dark') {
      return 'bg-white text-black';
    } else {
      return `bg-${colors.highlightBg} text-white`;
    }
  };

  const getCheckIconColor = () => {
    if (theme === 'light') {
      return 'text-gray-900';
    } else if (theme === 'dark') {
      return 'text-white';
    } else {
      return `text-${colors.checkIcon}`;
    }
  };

  const canStartBuilding = selectedModel && importedDataList.length > 0;

  // 判断模型是否可用（基于导入的数据集数量）
  const isModelDisabled = (modelId: string): boolean => {
    if (importedDataList.length === 0) return false;
    const isMultivariate = modelId === 'var' || modelId === 'vecm';

    if (importedDataList.length === 1) {
      return isMultivariate; // 1个数据集禁用VAR/VECM
    }
    if (importedDataList.length >= 2) {
      return !isMultivariate; // 2个以上数据集禁用单变量模型
    }
    return false;
  };

  // 自动清除无效选择
  useEffect(() => {
    if (selectedModel && isModelDisabled(selectedModel)) {
      setSelectedModel('');
    }
  }, [importedDataList.length]);

  return (
    <div className={`h-full overflow-y-auto ${theme === 'dark' ? 'bg-black' : `bg-gradient-to-br ${colors.gradient}`}`}>
      <Toaster position="top-center" toastOptions={{ style: { marginTop: '80px' } }} />
      {/* Header 已全局集成，无需引入 */}
      {/* Header */}


      {/* Main Content */}
      <div className="px-6 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-2`}>模型构建</h1>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>选择数据和模型类型，配置参数并开始建模</p>
          </div>

          <div className="space-y-6">
            {/* Row 1: 选择数据类 + 选择建模数据 */}
            <div className="grid grid-cols-2 gap-6">
              {/* 选择数据类 */}
              <div className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border-2 ${colors.borderColor} p-6`}>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${theme === 'dark' ? 'bg-gray-800 border border-gray-600' : `bg-${colors.primaryLight}`}`}>
                      <i className={`ri-database-2-line text-${colors.primaryText} text-xl`}></i>
                    </div>
                    <div>
                      <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>选择数据类</h2>
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>从数据库中选择用于建模的数据</p>
                    </div>
                  </div>
                  {/* 搜索按钮 */}
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="搜索..."
                      className={`w-40 pl-9 pr-3 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 ${theme === 'dark' ? 'bg-gray-800 text-white placeholder-gray-500' : 'bg-white'}`}
                    />
                    <i className={`ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'} text-sm`}></i>
                  </div>
                </div>

                {datasetFiles.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <p>暂无数据，请先到"我的数据"获取</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {paginatedData.map((data) => (
                      <div
                        key={data.filename}
                        onClick={() => handleDataSelect(data.filename)}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${selectedDataId === data.filename
                          ? `${colors.selectedBorder} ${theme === 'dark' ? 'bg-gray-800' : `bg-${colors.primaryLight}`}`
                          : `${colors.borderColor} ${theme === 'dark' ? 'hover:border-gray-600' : 'hover:border-gray-300'}`
                          }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'} line-clamp-2 flex-1`}>{data.filename}</h3>
                          {selectedDataId === data.filename && (
                            <i className={`ri-checkbox-circle-fill ${getCheckIconColor()} text-lg flex-shrink-0`}></i>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-xs font-medium px-2 py-1 rounded ${theme === 'dark' ? 'bg-gray-800' : `bg-${colors.primaryLight}`} text-${colors.primaryText}`}>
                            {data.category || 'N/A'}
                          </span>
                          <span className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                            {data.rows.toLocaleString()} 行 × {data.cols} 列
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}


                {/* 分页 */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className={`w-8 h-8 flex items-center justify-center rounded border-2 ${colors.borderColor} cursor-pointer text-sm ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : theme === 'dark' ? 'text-white hover:bg-gray-800' : 'text-gray-900 hover:bg-gray-50'
                        }`}
                    >
                      <i className="ri-arrow-left-s-line"></i>
                    </button>
                    <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className={`w-8 h-8 flex items-center justify-center rounded border-2 ${colors.borderColor} cursor-pointer text-sm ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : theme === 'dark' ? 'text-white hover:bg-gray-800' : 'text-gray-900 hover:bg-gray-50'
                        }`}
                    >
                      <i className="ri-arrow-right-s-line"></i>
                    </button>
                  </div>
                )}
              </div>

              {/* 选择建模数据 */}
              <div className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border-2 ${colors.borderColor} p-6`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${theme === 'dark' ? 'bg-gray-800 border border-gray-600' : `bg-${colors.primaryLight}`}`}>
                    <i className={`ri-file-list-3-line text-${colors.primaryText} text-xl`}></i>
                  </div>
                  <div>
                    <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>建模数据配置</h2>
                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>选择数据列并预览</p>
                  </div>
                </div>
                {loadingColumns ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  </div>
                ) : showColumnSelector ? (
                  <div className="space-y-4">
                    {/* 日期范围筛选 */}
                    <div className="grid grid-cols-3 gap-3 items-center">
                      <div>
                        <label className={`block text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-1`}>起始日期</label>
                        <input
                          type="text"
                          value={dataStartDate}
                          onChange={(e) => setDataStartDate(e.target.value)}
                          placeholder="2025-01-01"
                          className={`w-full px-3 py-2 text-xs border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'}`}
                        />
                      </div>
                      <div>
                        <label className={`block text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-1`}>结束日期</label>
                        <input
                          type="text"
                          value={dataEndDate}
                          onChange={(e) => setDataEndDate(e.target.value)}
                          placeholder="2025-07-01"
                          className={`w-full px-3 py-2 text-xs border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'}`}
                        />
                      </div>
                      <div className="flex items-end">
                        <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                          数据总量: <span className="font-semibold">{totalDataRows}行</span>
                        </div>
                      </div>
                    </div>

                    {/* 列选择器 */}
                    <div className={`border-2 ${colors.borderColor} rounded-lg p-4 mb-4`}>
                      <div className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-3`}>选择数据列</div>
                      <div className="flex flex-wrap gap-2">
                        {availableColumns.map((col) => {
                          const isDateCol = isDateColumn(col.name);
                          return (
                            <label
                              key={col.name}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-all ${col.selected
                                ? `${colors.selectedBorder} ${theme === 'dark' ? 'bg-gray-800' : `bg-${colors.primaryLight}`}`
                                : `${colors.borderColor} ${theme === 'dark' ? 'hover:border-gray-600' : 'hover:border-gray-300'}`
                                } ${isDateCol ? 'cursor-not-allowed opacity-60' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={col.selected}
                                disabled={isDateCol}
                                onChange={() => handleColumnToggle(col.name)}
                                className={`w-4 h-4 text-${colors.primaryText} rounded ${isDateCol ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                              />
                              <span className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                {col.name}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* 数据预览表格 - 左侧字段名，右侧数据 */}
                    <div className={`border-2 ${colors.borderColor} rounded-lg overflow-hidden`}>
                      <div className="overflow-x-auto max-h-64">
                        <div className="flex">
                          {/* 左侧固定列 - 字段名 */}
                          <div className="flex-shrink-0 sticky left-0 z-10">
                            {availableColumns.filter(col => col.selected).map((col) => (
                              <div
                                key={col.name}
                                className={`px-4 py-2 text-sm font-medium ${theme === 'dark' ? 'text-white bg-gray-900' : `text-gray-900 bg-white`} border-b ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}
                              >
                                {col.name}
                              </div>
                            ))}
                          </div>

                          {/* 右侧数据列 - 显示前10列 */}
                          <div className="flex">
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((colIdx) => (
                              <div key={colIdx} className="flex-shrink-0">
                                {availableColumns.filter(col => col.selected).map((col) => (
                                  <div
                                    key={`${col.name}-${colIdx}`}
                                    className={`px-4 py-2 text-sm ${theme === 'dark' ? 'text-gray-300 bg-gray-900' : `text-gray-700 bg-white`} border-b border-l ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'} min-w-[120px] text-center`}
                                  >
                                    {col.previewData[colIdx] !== undefined
                                      ? typeof col.previewData[colIdx] === 'number'
                                        ? Number(col.previewData[colIdx]).toLocaleString()
                                        : col.previewData[colIdx]
                                      : '-'}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 已选择特征数量 - 添加提示 */}
                    <div className="space-y-1">
                      <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                        已选择 <span className="font-semibold text-lg">{availableColumns.filter(c => c.selected).length}</span> 个特征字段进行建模
                      </div>
                      <div className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} flex items-start gap-1`}>
                        <i className="ri-information-line text-sm mt-0.5"></i>
                        <span>除日期列外，最多可选择2个特征字段用于模型训练</span>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleCancelImport}
                        className={`px-6 py-2 ${theme === 'dark' ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap`}
                      >
                        取消
                      </button>
                      <button
                        onClick={handleConfirmImport}
                        className={`flex-1 px-4 py-2 ${getHighlightStyle()} text-sm font-medium rounded-lg hover:opacity-90 cursor-pointer whitespace-nowrap`}
                      >
                        确认并导入
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`h-64 flex flex-col items-center justify-center ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                    <i className="ri-inbox-line text-5xl mb-3"></i>
                    <p className="text-sm">请在左侧选择数据类</p>
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: 建模数据 */}
            <div className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border-2 ${colors.borderColor} p-6`}>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${theme === 'dark' ? 'bg-gray-800 border border-gray-600' : `bg-${colors.primaryLight}`}`}>
                    <i className={`ri-table-line text-${colors.primaryText} text-xl`}></i>
                  </div>
                  <div>
                    <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>建模数据</h2>
                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>已导入的数据预览</p>
                  </div>
                </div>
                {importedDataList.length > 0 && (
                  <button
                    onClick={handleClearImportedData}
                    className={`px-3 py-2 ${theme === 'dark' ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap flex items-center gap-1.5 transition-colors`}
                  >
                    <i className="ri-delete-bin-line text-base"></i>
                    清空
                  </button>
                )}
              </div>
              {importedDataList.length > 0 ? (
                <div className={`border-2 ${colors.borderColor} rounded-lg overflow-hidden`}>
                  <div className="overflow-x-auto max-h-64">
                    <div className="flex">
                      {/* 左侧固定列 - 字段名 */}
                      <div className="flex-shrink-0 sticky left-0 z-10">
                        {importedDataList[0].columns.map((col) => (
                          <div
                            key={col.name}
                            className={`px-4 py-2 text-sm font-medium ${theme === 'dark' ? 'text-white bg-gray-900' : `text-gray-900 bg-white`} border-b ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}
                          >
                            {col.name}
                          </div>
                        ))}
                        {importedDataList.slice(1).map((data) => (
                          data.columns.filter(c => c.name !== data.dateColumn).map((col) => (
                            <div
                              key={`${data.dataId}-${col.name}`}
                              className={`px-4 py-2 text-sm font-medium ${theme === 'dark' ? 'text-white bg-gray-900' : `text-gray-900 bg-white`} border-b ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}
                            >
                              {col.name}
                            </div>
                          ))
                        ))}
                      </div>

                      {/* 右侧数据列 - 显示前10列 */}
                      <div className="flex">
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((colIdx) => (
                          <div key={colIdx} className="flex-shrink-0">
                            {importedDataList[0].columns.map((col) => (
                              <div
                                key={col.name}
                                className={`px-4 py-2 text-sm ${theme === 'dark' ? 'text-gray-300 bg-gray-900' : `text-gray-700 bg-white`} border-b border-l ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'} min-w-[120px] text-center`}
                              >
                                {col.previewData[colIdx] !== undefined
                                  ? typeof col.previewData[colIdx] === 'number'
                                    ? Number(col.previewData[colIdx]).toLocaleString()
                                    : col.previewData[colIdx]
                                  : '-'}
                              </div>
                            ))}
                            {importedDataList.slice(1).map((data) => (
                              data.columns.filter(c => c.name !== data.dateColumn).map((col) => (
                                <div
                                  key={`${data.dataId}-${col.name}`}
                                  className={`px-4 py-2 text-sm ${theme === 'dark' ? 'text-gray-300 bg-gray-900' : `text-gray-700 bg-white`} border-b border-l ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'} min-w-[120px] text-center`}
                                >
                                  {col.previewData[colIdx] !== undefined
                                    ? typeof col.previewData[colIdx] === 'number'
                                      ? Number(col.previewData[colIdx]).toLocaleString()
                                      : col.previewData[colIdx]
                                    : '-'}
                                </div>
                              ))
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`h-48 flex flex-col items-center justify-center ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                  <i className="ri-inbox-line text-5xl mb-3"></i>
                  <p className="text-sm">暂无导入的数据</p>
                </div>
              )}
            </div>

            {/* Row 3: 选择模型类型 + 参数配置 + 建模提示 */}
            <div className="grid grid-cols-4 gap-6">
              {/* 选择模型类型 - 占2列 */}
              <div className={`col-span-2 ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border-2 ${colors.borderColor} p-6`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${theme === 'dark' ? 'bg-gray-800 border border-gray-600' : `bg-${colors.primaryLight}`}`}>
                    <i className={`ri-function-line text-${colors.primaryText} text-xl`}></i>
                  </div>
                  <div>
                    <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>选择模型类型</h2>
                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>根据研究需求选择合适的模型</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {modelTypes.map((model) => {
                    const disabled = isModelDisabled(model.id);
                    const isMultivariate = model.id === 'var' || model.id === 'vecm';
                    return (
                      <div
                        key={model.id}
                        onClick={() => !disabled && setSelectedModel(model.id)}
                        className={`p-4 rounded-xl border-2 transition-all ${disabled
                          ? `${colors.borderColor} opacity-50 cursor-not-allowed`
                          : selectedModel === model.id
                            ? `${colors.selectedBorder} ${theme === 'dark' ? 'bg-gray-800' : `bg-${colors.primaryLight}`} cursor-pointer`
                            : `${colors.borderColor} ${theme === 'dark' ? 'hover:border-gray-600' : 'hover:border-gray-300'} cursor-pointer`
                          }`}
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <div className={`w-10 h-10 flex items-center justify-center rounded-lg bg-gradient-to-br ${colors.cardGradient} ${disabled ? 'opacity-50' : ''}`}>
                            <i className={`${model.icon} text-white text-xl`}></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-1`}>{model.name}</h3>
                            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} line-clamp-2`}>{model.description}</p>
                          </div>
                        </div>
                        {disabled && (
                          <p className={`text-xs ${theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600'} flex items-center gap-1`}>
                            <i className="ri-information-line"></i>
                            {isMultivariate ? '需要2个数据列' : '仅支持单变量'}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 参数配置 - 占1列 */}
              <div className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-xl border-2 ${colors.borderColor} p-6`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${theme === 'dark' ? 'bg-gray-800 border border-gray-600' : `bg-${colors.primaryLight}`}`}>
                    <i className={`ri-settings-3-line text-${colors.primaryText} text-xl`}></i>
                  </div>
                  <div>
                    <h2 className={`text-base font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>参数配置</h2>
                  </div>
                </div>
                {selectedModel ? (
                  <div className="space-y-4">
                    {selectedModel === 'arma' && (
                      <>
                        <div>
                          <label className={`block text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>AR阶数 (p)</label>
                          <input
                            type="number"
                            value={armaParams.p}
                            onChange={(e) => setArmaParams({ ...armaParams, p: parseInt(e.target.value) || 0 })}
                            className={`w-full px-3 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'}`}
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>MA阶数 (q)</label>
                          <input
                            type="number"
                            value={armaParams.q}
                            onChange={(e) => setArmaParams({ ...armaParams, q: parseInt(e.target.value) || 0 })}
                            className={`w-full px-3 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'}`}
                          />
                        </div>
                        <div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" defaultChecked className={`w-4 h-4 text-${colors.primaryText} rounded cursor-pointer`} />
                            <span className={`text-xs ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>包含常数项</span>
                          </label>
                        </div>
                      </>
                    )}

                    {selectedModel === 'arima' && (
                      <>
                        <div>
                          <label className={`block text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>AR阶数 (p)</label>
                          <input
                            type="number"
                            value={arimaParams.p}
                            onChange={(e) => setArimaParams({ ...arimaParams, p: parseInt(e.target.value) || 0 })}
                            className={`w-full px-3 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'}`}
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>差分阶数 (d)</label>
                          <input
                            type="number"
                            value={arimaParams.d}
                            onChange={(e) => setArimaParams({ ...arimaParams, d: parseInt(e.target.value) || 0 })}
                            className={`w-full px-3 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'}`}
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>MA阶数 (q)</label>
                          <input
                            type="number"
                            value={arimaParams.q}
                            onChange={(e) => setArimaParams({ ...arimaParams, q: parseInt(e.target.value) || 0 })}
                            className={`w-full px-3 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'}`}
                          />
                        </div>
                      </>
                    )}

                    {/* Other models... (Keeping simplified for brevity as logic is same, just rendering parameters) */}
                    {/* For brevity, I'll allow the other models to render their inputs as in original but ensure styles match */}
                    {/* Re-implementing the other models to be safe */}

                    {selectedModel === 'arch' && (
                      <>
                        <div>
                          <label className={`block text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>ARCH阶数 (q)</label>
                          <input
                            type="number"
                            value={archParams.q}
                            onChange={(e) => setArchParams({ ...archParams, q: parseInt(e.target.value) || 0 })}
                            className={`w-full px-3 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'}`}
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>分布假设</label>
                          <select
                            value={archParams.dist}
                            onChange={(e) => setArchParams({ ...archParams, dist: e.target.value as 'normal' | 't' | 'ged' })}
                            className={`w-full px-3 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 cursor-pointer ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'}`}
                          >
                            <option value="normal">正态分布</option>
                            <option value="t">t分布</option>
                            <option value="ged">GED分布</option>
                          </select>
                        </div>
                      </>
                    )}

                    {selectedModel === 'garch' && (
                      <>
                        <div>
                          <label className={`block text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>ARCH阶数 (p)</label>
                          <input
                            type="number"
                            value={garchParams.p}
                            onChange={(e) => setGarchParams({ ...garchParams, p: parseInt(e.target.value) || 0 })}
                            className={`w-full px-3 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'}`}
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>GARCH阶数 (q)</label>
                          <input
                            type="number"
                            value={garchParams.q}
                            onChange={(e) => setGarchParams({ ...garchParams, q: parseInt(e.target.value) || 0 })}
                            className={`w-full px-3 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'}`}
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>分布类型</label>
                          <select
                            value={garchParams.dist}
                            onChange={(e) => setGarchParams({ ...garchParams, dist: e.target.value as 'normal' | 't' | 'ged' })}
                            className={`w-full px-3 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 cursor-pointer ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'}`}
                          >
                            <option value="normal">正态分布</option>
                            <option value="t">t分布</option>
                            <option value="ged">GED分布</option>
                          </select>
                        </div>
                      </>
                    )}

                    {selectedModel === 'var' && (
                      <>
                        <div>
                          <label className={`block text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>滞后阶数</label>
                          <input
                            type="number"
                            value={varParams.lags}
                            onChange={(e) => setVarParams({ ...varParams, lags: parseInt(e.target.value) || 0 })}
                            className={`w-full px-3 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'}`}
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>趋势项设定</label>
                          <select className={`w-full px-3 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 cursor-pointer ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'}`}>
                            <option>无趋势</option>
                            <option>常数项</option>
                            <option>线性趋势</option>
                            <option>二次趋势</option>
                          </select>
                        </div>
                      </>
                    )}

                    {selectedModel === 'vecm' && (
                      <>
                        <div>
                          <label className={`block text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>协整秩</label>
                          <input
                            type="number"
                            value={vecmParams.coint_rank}
                            onChange={(e) => setVecmParams({ ...vecmParams, coint_rank: parseInt(e.target.value) || 0 })}
                            className={`w-full px-3 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'}`}
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>滞后阶数</label>
                          <input
                            type="number"
                            value={vecmParams.lags}
                            onChange={(e) => setVecmParams({ ...vecmParams, lags: parseInt(e.target.value) || 0 })}
                            className={`w-full px-3 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'}`}
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>趋势设定</label>
                          <select className={`w-full px-3 py-2 text-sm border-2 ${colors.borderColor} rounded-lg focus:outline-none focus:ring-2 cursor-pointer ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'}`}>
                            <option>无趋势无常数</option>
                            <option>有常数无趋势</option>
                            <option>有常数有趋势</option>
                          </select>
                        </div>
                      </>
                    )}

                    {/* 开始构建按钮 */}
                    <div className="pt-4">
                      <button
                        onClick={handleStartBuilding}
                        disabled={!canStartBuilding || isBuilding}
                        title={!canStartBuilding ? '请确保选择了输入数据与模型' : ''}
                        className={`w-full px-4 py-3 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 whitespace-nowrap transition-all ${canStartBuilding && !isBuilding
                          ? `${getHighlightStyle()} hover:opacity-90 cursor-pointer`
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                      >
                        {isBuilding ? (
                          <>
                            <div className="w-5 h-5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
                            构建中...
                          </>
                        ) : (
                          <>
                            <i className="ri-play-circle-line text-xl"></i>
                            开始构建模型
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`h-64 flex flex-col items-center justify-center ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                    <i className="ri-inbox-line text-5xl mb-3"></i>
                    <p className="text-sm">请在左侧选择模型类型</p>
                  </div>
                )}
              </div>

              {/* 建模提示 - 占1列 */}
              <div className={`${theme === 'dark' ? 'bg-gray-900' : `bg-gradient-to-br ${colors.gradient}`} rounded-xl border-2 ${colors.borderColor} p-6`}>
                {/* 标题区域 */}
                <div className="flex items-center gap-3 mb-5">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${theme === 'dark' ? 'bg-white border border-gray-300' : theme === 'light' ? 'bg-gray-900' : `bg-${colors.primary}`}`}>
                    <i className={`ri-lightbulb-line ${theme === 'dark' ? 'text-black' : 'text-white'} text-xl`}></i>
                  </div>
                  <h3 className={`text-base font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>建模提示</h3>
                </div>

                {/* 列表区域 */}
                <ul className={`space-y-3 text-xs ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  <li className="flex items-center gap-2">
                    <i className={`ri-check-line ${theme === 'dark' ? 'text-white' : theme === 'light' ? 'text-gray-900' : `text-${colors.primaryText}`} text-base flex-shrink-0`}></i>
                    <span className="flex-1">建议先进行数据平稳性检验</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <i className={`ri-check-line ${theme === 'dark' ? 'text-white' : theme === 'light' ? 'text-gray-900' : `text-${colors.primaryText}`} text-base flex-shrink-0`}></i>
                    <span className="flex-1">GARCH模型适用于波动率聚集的序列</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <i className={`ri-check-line ${theme === 'dark' ? 'text-white' : theme === 'light' ? 'text-gray-900' : `text-${colors.primaryText}`} text-base flex-shrink-0`}></i>
                    <span className="flex-1">VAR模型要求所有变量同阶平稳</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <i className={`ri-check-line ${theme === 'dark' ? 'text-white' : theme === 'light' ? 'text-gray-900' : `text-${colors.primaryText}`} text-base flex-shrink-0`}></i>
                    <span className="flex-1">使用AIC/BIC准则选择最优阶数</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
