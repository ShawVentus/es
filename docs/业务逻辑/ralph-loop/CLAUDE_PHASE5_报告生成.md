# CLAUDE.md - Phase 5: 学术报告生成系统

## 📋 阶段目标

从零构建完整的学术报告生成系统，包括：
1. Qwen API客户端（生成经济学含义分析）
2. Matplotlib图表生成器（10种可视化图表）
3. python-docx Word报告生成器
4. 报告API端点和前端对接

**核心原则**：
- 报告格式为Word (.docx)，可编辑
- 仅包含实证研究部分（无引言、文献综述、结论）
- AI生成的经济学含义分析200-500字
- 图表学术风格（无花哨装饰）
- 所有数据保存用于复现

---

## 📚 术语定义

| 术语 | 定义 | 说明 |
|------|------|------|
| **Qwen API** | 通义千问API，用于生成经济学文本分析 | 硬编码API Key |
| **指数退避** | 失败重试策略，每次等待时间加倍 | 1s→2s→4s→8s... |
| **python-docx** | Python Word文档生成库 | 支持表格、图片、样式 |
| **学术风格图表** | 简洁、无网格、灰色调、Times New Roman | 参考期刊论文风格 |
| **报告结构** | 数据说明→统计检验→模型结果→可视化 | 符合实证论文规范 |

---

## 📄 报告结构规范

### 完整报告章节

```
1. 数据说明与处理
   1.1 数据来源
       - 数据名称、来源API、获取时间、原始记录数
   1.2 数据预处理
       - 缺失值填充数量
       - 异常值检测与填充数量
       - 对数转换/差分转换（如有）
   1.3 描述性统计
       - 表格：均值、标准差、最小值、最大值、偏度、峰度

2. 统计检验结果
   2.1 单位根检验（ADF）
   2.2 正态性检验（JB）
   2.3 自相关检验（Ljung-Box Q）
   2.4 ARCH效应检验
   2.5 [多变量] 相关性矩阵
   2.6 [多变量] 多重共线性（VIF）
   2.7 [多变量] 协整检验（Johansen）
   2.8 [多变量] 格兰杰因果检验

3. 模型构建与结果
   3.1 模型选择依据
   3.2 模型参数设定
   3.3 参数估计结果表格
   3.4 拟合优度指标（R²、AIC、BIC、LogLik）
   3.5 残差诊断
   3.6 **经济学含义分析**（AI生成）

4. 可视化图表
   4.1 原始数据时间序列图
   4.2 ACF图
   4.3 PACF图
   4.4 残差时间序列图
   4.5 残差直方图+正态曲线
   4.6 残差QQ图
   4.7 拟合值vs实际值对比图
   4.8 [GARCH] 条件波动率图
   4.9 [VAR/VECM] 脉冲响应图
   4.10 [VAR/VECM] 方差分解图
```

---

## 🎯 详细任务清单

### Task 5.1: 创建Qwen API客户端

**目标**：实现调用Qwen API生成经济学文本分析

**参考文档**：`/root/docs/qwen_api.md`

#### 子任务 5.1.1: 创建Qwen客户端类

**文件**：`/root/stock-mcp/src/server/domain/services/qwen_client.py`

**实现内容**：
```python
"""Qwen API客户端"""

import httpx
import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)

class QwenClient:
    """通义千问API客户端"""
    
    def __init__(self):
        # 硬编码API配置（参考 /root/docs/qwen_api.md）
        self.base_url = "https://openapi.dp.tech/openapi/v1"
        self.api_key = "4c97924ea86e4b40b9cf091dcfd20e44"
        self.model = "qwen-plus"
        
        # 重试配置
        self.max_retries = 5
        self.initial_delay = 1  # 秒
    
    def _exponential_backoff(self, attempt: int) -> float:
        """计算指数退避等待时间"""
        return self.initial_delay * (2 ** attempt)
    
    def generate_economic_analysis(
        self, 
        model_type: str,
        model_params: dict,
        metrics: dict,
        test_results: dict,
        max_tokens: int = 800
    ) -> str:
        """
        生成经济学含义分析
        
        Args:
            model_type: 模型类型（ARIMA/GARCH/VAR等）
            model_params: 模型参数字典
            metrics: 拟合优度指标
            test_results: 残差检验结果
            max_tokens: 最大生成token数
        
        Returns:
            生成的经济学分析文本（200-500字）
        """
        # 构建Prompt
        prompt = self._build_prompt(model_type, model_params, metrics, test_results)
        
        # 带指数退避的重试
        for attempt in range(self.max_retries):
            try:
                response = self._call_api(prompt, max_tokens)
                if response:
                    return response
            except Exception as e:
                logger.warning(f"Qwen API调用失败 (尝试 {attempt+1}/{self.max_retries}): {e}")
                
                if attempt < self.max_retries - 1:
                    wait_time = self._exponential_backoff(attempt)
                    logger.info(f"等待 {wait_time}秒 后重试...")
                    time.sleep(wait_time)
        
        # 所有重试失败，返回模板文本
        return self._fallback_template(model_type, model_params, metrics)
    
    def _build_prompt(
        self, 
        model_type: str, 
        model_params: dict, 
        metrics: dict,
        test_results: dict
    ) -> str:
        """构建Prompt"""
        
        prompt = f"""请根据以下{model_type}模型的估计结果，生成200-500字的经济学含义分析，用于学术论文的实证结果解释部分。

## 模型类型
{model_type}

## 模型参数
{self._format_params(model_params)}

## 拟合优度指标
- R²: {metrics.get('r2', 'N/A')}
- AIC: {metrics.get('aic', 'N/A')}
- BIC: {metrics.get('bic', 'N/A')}
- Log-Likelihood: {metrics.get('log_likelihood', 'N/A')}

## 残差诊断
{self._format_test_results(test_results)}

## 输出要求
1. 语言风格：学术论文风格，客观严谨
2. 内容结构：
   - 模型拟合质量评价
   - 重要参数的经济含义解释
   - 残差诊断结论
   - 模型的局限性说明（如有）
3. 长度：200-500字
4. 避免完全重复输入的数据，要有分析性解读

请直接输出分析文本，不要输出标题。"""
        
        return prompt
    
    def _format_params(self, params: dict) -> str:
        """格式化模型参数"""
        lines = []
        for key, value in params.items():
            if isinstance(value, dict):
                for sub_key, sub_value in value.items():
                    lines.append(f"- {key}.{sub_key}: {sub_value}")
            else:
                lines.append(f"- {key}: {value}")
        return "\n".join(lines)
    
    def _format_test_results(self, test_results: dict) -> str:
        """格式化检验结果"""
        lines = []
        for test_name, result in test_results.items():
            if isinstance(result, dict):
                p_value = result.get('p_value', result.get('p-value', 'N/A'))
                conclusion = result.get('conclusion', '')
                lines.append(f"- {test_name}: p值={p_value}, {conclusion}")
            else:
                lines.append(f"- {test_name}: {result}")
        return "\n".join(lines) if lines else "无残差诊断数据"
    
    def _call_api(self, prompt: str, max_tokens: int) -> Optional[str]:
        """调用Qwen API"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "max_tokens": max_tokens
        }
        
        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload
            )
            
            if response.status_code == 200:
                data = response.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                return content.strip()
            else:
                raise Exception(f"API返回状态码 {response.status_code}: {response.text}")
    
    def _fallback_template(
        self, 
        model_type: str, 
        model_params: dict, 
        metrics: dict
    ) -> str:
        """降级方案：返回模板化文本"""
        r2 = metrics.get('r2', 0)
        aic = metrics.get('aic', 0)
        
        text = f"""本研究采用{model_type}模型对时间序列数据进行分析。"""
        
        if r2 and r2 > 0:
            if r2 > 0.8:
                text += f"模型的拟合优度R²为{r2:.4f}，表明模型对数据的解释能力较强。"
            elif r2 > 0.5:
                text += f"模型的拟合优度R²为{r2:.4f}，表明模型对数据有一定的解释能力。"
            else:
                text += f"模型的拟合优度R²为{r2:.4f}，模型解释能力有限，可能需要进一步优化。"
        
        text += f"信息准则AIC为{aic:.2f}，综合考虑模型复杂度与拟合效果，该模型在备选模型中表现较优。"
        
        text += "从残差诊断结果来看，需结合后续检验进一步确认模型的适用性。研究结论仍需谨慎解读，建议结合实际经济背景进行深入分析。"
        
        return text
```

**验证标准**：
- [ ] 客户端类创建成功
- [ ] 指数退避重试机制实现
- [ ] Prompt构建逻辑正确
- [ ] 降级方案（模板文本）实现
- [ ] 支持不同模型类型

---

### Task 5.2: 创建图表生成器

**目标**：生成10种学术风格可视化图表

#### 子任务 5.2.1: 创建图表生成服务

**文件**：`/root/stock-mcp/src/server/domain/services/chart_generator.py`

**实现内容**：
```python
"""图表生成服务"""

# ⚠️ 关键：必须在import pyplot之前设置后端，否则Linux无头服务器会崩溃
import matplotlib
matplotlib.use('Agg')  # 使用非交互式后端，避免 _tkinter.TclError: no display name

import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.graphics.tsaplots import plot_acf, plot_pacf
from typing import Dict, Any, Optional, List, Union
import os
import logging

logger = logging.getLogger(__name__)

# 配置中文字体
plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# 学术风格配置
ACADEMIC_STYLE = {
    'figure.figsize': (10, 6),
    'axes.grid': False,
    'axes.spines.top': False,
    'axes.spines.right': False,
    'axes.labelsize': 12,
    'axes.titlesize': 14,
    'xtick.labelsize': 10,
    'ytick.labelsize': 10,
    'legend.fontsize': 10,
    'lines.linewidth': 1.5,
    'axes.prop_cycle': plt.cycler(color=['#333333', '#666666', '#999999', '#0066CC'])
}

class ChartGenerator:
    """图表生成器"""
    
    def __init__(self, output_dir: str):
        """
        初始化图表生成器
        
        Args:
            output_dir: 图表输出目录
        """
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        
        # 应用学术风格
        plt.rcParams.update(ACADEMIC_STYLE)
    
    def _save_figure(self, fig, filename: str) -> str:
        """保存图表"""
        file_path = os.path.join(self.output_dir, filename)
        fig.savefig(file_path, dpi=150, bbox_inches='tight', facecolor='white')
        plt.close(fig)
        logger.info(f"图表已保存: {file_path}")
        return file_path
    
    def plot_time_series(
        self, 
        data: Union[List[float], Dict[str, List[float]]],  # ✅ 支持单变量和多变量
        title: str = "时间序列图",
        ylabel: str = "值",
        dates: Optional[List] = None
    ) -> str:
        """
        绘制时间序列图（支持单变量和多变量）
        
        Args:
            data: 时间序列数据
                  - 单变量: List[float]
                  - 多变量: Dict[str, List[float]]，键为变量名
            title: 图表标题
            ylabel: Y轴标签
            dates: 日期序列（可选）
        
        Returns:
            图片文件路径
        """
        fig, ax = plt.subplots(figsize=(12, 5))
        
        # ✅ 判断是单变量还是多变量
        if isinstance(data, dict):
            # 多变量：循环绘制每条线
            colors = ['#333333', '#0066CC', '#CC0000', '#009933', '#FF6600']
            for idx, (var_name, values) in enumerate(data.items()):
                color = colors[idx % len(colors)]
                if dates:
                    ax.plot(dates, values, color=color, linewidth=1, label=var_name)
                else:
                    ax.plot(values, color=color, linewidth=1, label=var_name)
            ax.legend()  # 多变量需要图例
        else:
            # 单变量
            if dates:
                ax.plot(dates, data, color='#333333', linewidth=1)
            else:
                ax.plot(data, color='#333333', linewidth=1)
        
        ax.set_xlabel('日期' if dates else '观测序号')
        ax.set_ylabel(ylabel)
        ax.set_title(title)
        
        return self._save_figure(fig, 'time_series.png')
    
    def plot_acf_chart(
        self, 
        data: List[float], 
        lags: int = 20,
        title: str = "自相关函数图 (ACF)"
    ) -> str:
        """
        绘制ACF图
        
        Args:
            data: 时间序列数据
            lags: 滞后阶数
            title: 图表标题
        
        Returns:
            图片文件路径
        """
        fig, ax = plt.subplots(figsize=(10, 4))
        
        plot_acf(data, lags=lags, ax=ax, color='#333333')
        ax.set_title(title)
        ax.set_xlabel('滞后阶数')
        ax.set_ylabel('自相关系数')
        
        return self._save_figure(fig, 'acf.png')
    
    def plot_pacf_chart(
        self, 
        data: List[float], 
        lags: int = 20,
        title: str = "偏自相关函数图 (PACF)"
    ) -> str:
        """
        绘制PACF图
        
        Args:
            data: 时间序列数据
            lags: 滞后阶数
            title: 图表标题
        
        Returns:
            图片文件路径
        """
        fig, ax = plt.subplots(figsize=(10, 4))
        
        plot_pacf(data, lags=lags, ax=ax, method='ywm', color='#333333')
        ax.set_title(title)
        ax.set_xlabel('滞后阶数')
        ax.set_ylabel('偏自相关系数')
        
        return self._save_figure(fig, 'pacf.png')
    
    def plot_residuals_series(
        self, 
        residuals: List[float],
        title: str = "残差时间序列图"
    ) -> str:
        """绘制残差时间序列图"""
        fig, ax = plt.subplots(figsize=(12, 4))
        
        ax.plot(residuals, color='#333333', linewidth=0.8)
        ax.axhline(y=0, color='#CC0000', linestyle='--', linewidth=1)
        ax.set_xlabel('观测序号')
        ax.set_ylabel('残差')
        ax.set_title(title)
        
        return self._save_figure(fig, 'residuals_series.png')
    
    def plot_residuals_histogram(
        self, 
        residuals: List[float],
        title: str = "残差直方图"
    ) -> str:
        """绘制残差直方图（含正态曲线）"""
        fig, ax = plt.subplots(figsize=(8, 5))
        
        # 直方图
        n, bins, patches = ax.hist(
            residuals, 
            bins=30, 
            density=True, 
            color='#999999', 
            edgecolor='white',
            alpha=0.7
        )
        
        # 正态分布曲线
        mu, std = np.mean(residuals), np.std(residuals)
        x = np.linspace(min(residuals), max(residuals), 100)
        ax.plot(x, stats.norm.pdf(x, mu, std), color='#CC0000', linewidth=2, 
                label=f'正态分布 (μ={mu:.3f}, σ={std:.3f})')
        
        ax.set_xlabel('残差值')
        ax.set_ylabel('密度')
        ax.set_title(title)
        ax.legend()
        
        return self._save_figure(fig, 'residuals_histogram.png')
    
    def plot_qq(
        self, 
        residuals: List[float],
        title: str = "残差Q-Q图"
    ) -> str:
        """绘制残差QQ图"""
        fig, ax = plt.subplots(figsize=(6, 6))
        
        stats.probplot(residuals, dist="norm", plot=ax)
        ax.get_lines()[0].set_markerfacecolor('#333333')
        ax.get_lines()[0].set_markeredgecolor('#333333')
        ax.get_lines()[0].set_markersize(4)
        ax.get_lines()[1].set_color('#CC0000')
        ax.set_title(title)
        
        return self._save_figure(fig, 'qq_plot.png')
    
    def plot_fitted_vs_actual(
        self, 
        actual: List[float], 
        fitted: List[float],
        title: str = "拟合值与实际值对比图"
    ) -> str:
        """绘制拟合值vs实际值图"""
        fig, ax = plt.subplots(figsize=(12, 5))
        
        ax.plot(actual, color='#333333', linewidth=1, label='实际值', alpha=0.7)
        ax.plot(fitted, color='#0066CC', linewidth=1, label='拟合值')
        ax.set_xlabel('观测序号')
        ax.set_ylabel('值')
        ax.set_title(title)
        ax.legend()
        
        return self._save_figure(fig, 'fitted_vs_actual.png')
    
    def plot_conditional_volatility(
        self, 
        cond_vol: List[float],
        title: str = "条件波动率图"
    ) -> str:
        """绘制条件波动率图（GARCH模型）"""
        fig, ax = plt.subplots(figsize=(12, 4))
        
        ax.fill_between(
            range(len(cond_vol)), 
            cond_vol, 
            color='#0066CC', 
            alpha=0.3
        )
        ax.plot(cond_vol, color='#0066CC', linewidth=1)
        ax.set_xlabel('观测序号')
        ax.set_ylabel('条件波动率')
        ax.set_title(title)
        
        return self._save_figure(fig, 'conditional_volatility.png')
    
    def plot_impulse_response(
        self, 
        irf_data: Dict[str, Dict[str, Dict[str, Any]]],
        periods: int = 10,
        title: str = "脉冲响应函数图"
    ) -> str:
        """
        绘制脉冲响应图（VAR/VECM模型）
        
        Args:
            irf_data: 脉冲响应数据 {shock_var: {response_var: {response, ci_lower, ci_upper}}}
            periods: 响应期数
            title: 图表标题
        
        Returns:
            图片文件路径
        """
        shock_vars = list(irf_data.keys())
        n_vars = len(shock_vars)
        
        fig, axes = plt.subplots(n_vars, n_vars, figsize=(4*n_vars, 3*n_vars))
        
        # 确保axes是2D数组
        if n_vars == 1:
            axes = np.array([[axes]])
        
        for i, shock_var in enumerate(shock_vars):
            for j, response_var in enumerate(shock_vars):
                ax = axes[i, j]
                
                if shock_var in irf_data and response_var in irf_data[shock_var]:
                    data = irf_data[shock_var][response_var]
                    response = data.get('response', [])
                    ci_lower = data.get('ci_lower')
                    ci_upper = data.get('ci_upper')
                    
                    x = range(len(response))
                    ax.plot(x, response, color='#333333', linewidth=1.5)
                    ax.axhline(y=0, color='#999999', linestyle='--', linewidth=0.5)
                    
                    # 置信区间
                    if ci_lower and ci_upper:
                        ax.fill_between(x, ci_lower, ci_upper, color='#0066CC', alpha=0.2)
                
                ax.set_title(f'{shock_var} → {response_var}', fontsize=10)
                
                if i == n_vars - 1:
                    ax.set_xlabel('期数')
                if j == 0:
                    ax.set_ylabel('响应')
        
        fig.suptitle(title, fontsize=14)
        plt.tight_layout()
        
        return self._save_figure(fig, 'impulse_response.png')
    
    def plot_variance_decomposition(
        self, 
        decomp_data: Dict[str, List[List[float]]],
        variables: List[str],
        periods: int = 10,
        title: str = "方差分解图"
    ) -> str:
        """
        绘制方差分解图（VAR/VECM模型）
        
        Args:
            decomp_data: 方差分解数据 {var: [period][contribution_by_var]}
            variables: 变量名列表
            periods: 预测期数
            title: 图表标题
        
        Returns:
            图片文件路径
        """
        n_vars = len(variables)
        fig, axes = plt.subplots(1, n_vars, figsize=(5*n_vars, 4))
        
        if n_vars == 1:
            axes = [axes]
        
        colors = plt.cm.Set3(np.linspace(0, 1, n_vars))
        
        for i, var in enumerate(variables):
            ax = axes[i]
            
            if var in decomp_data:
                data = np.array(decomp_data[var])
                
                # 堆叠面积图
                ax.stackplot(
                    range(len(data)),
                    data.T,
                    labels=variables,
                    colors=colors
                )
                
            ax.set_title(f'{var} 的方差分解')
            ax.set_xlabel('预测期数')
            ax.set_ylabel('贡献比例')
            ax.set_ylim(0, 1)
            
            if i == n_vars - 1:
                ax.legend(loc='upper right', fontsize=8)
        
        fig.suptitle(title, fontsize=14)
        plt.tight_layout()
        
        return self._save_figure(fig, 'variance_decomposition.png')
    
    def generate_all_charts(
        self, 
        model_result: Dict[str, Any],
        model_type: str
    ) -> Dict[str, str]:
        """
        根据模型类型生成所有相关图表
        
        Args:
            model_result: 模型结果字典
            model_type: 模型类型
        
        Returns:
            图表路径字典 {chart_name: file_path}
        """
        chart_paths = {}
        data = model_result.get('data', {})
        
        # 通用图表
        if 'original' in data:
            original = data['original']
            if isinstance(original, dict):
                # 多变量
                first_var = list(original.keys())[0]
                original = original[first_var]
            
            chart_paths['time_series'] = self.plot_time_series(original)
            chart_paths['acf'] = self.plot_acf_chart(original)
            chart_paths['pacf'] = self.plot_pacf_chart(original)
        
        if 'residuals' in data:
            residuals = data['residuals']
            if isinstance(residuals, dict):
                first_var = list(residuals.keys())[0]
                residuals = residuals[first_var]
            
            # 过滤None值
            clean_residuals = [r for r in residuals if r is not None]
            
            if clean_residuals:
                chart_paths['residuals_series'] = self.plot_residuals_series(clean_residuals)
                chart_paths['residuals_hist'] = self.plot_residuals_histogram(clean_residuals)
                chart_paths['qq_plot'] = self.plot_qq(clean_residuals)
        
        if 'fitted' in data and 'original' in data:
            original = data['original']
            fitted = data['fitted']
            
            if isinstance(original, dict):
                first_var = list(original.keys())[0]
                original = original[first_var]
                fitted = fitted[first_var]
            
            # 过滤None
            valid_idx = [i for i, f in enumerate(fitted) if f is not None]
            if valid_idx:
                clean_actual = [original[i] for i in valid_idx]
                clean_fitted = [fitted[i] for i in valid_idx]
                chart_paths['fitted_vs_actual'] = self.plot_fitted_vs_actual(clean_actual, clean_fitted)
        
        # GARCH特有图表
        if model_type in ['GARCH', 'ARCH'] and 'conditional_volatility' in data:
            cond_vol = data['conditional_volatility']
            chart_paths['conditional_volatility'] = self.plot_conditional_volatility(cond_vol)
        
        # VAR/VECM特有图表
        if model_type in ['VAR', 'VECM']:
            if 'impulse_response' in model_result:
                irf = model_result['impulse_response']
                if irf.get('success') and 'irf_data' in irf:
                    chart_paths['impulse_response'] = self.plot_impulse_response(irf['irf_data'])
            
            if 'variance_decomposition' in model_result:
                fevd = model_result['variance_decomposition']
                if fevd.get('success'):
                    chart_paths['variance_decomposition'] = self.plot_variance_decomposition(
                        fevd['decomposition'],
                        model_result.get('variables', [])
                    )
        
        return chart_paths
```

**验证标准**：
- [ ] 10种图表生成方法全部实现
- [ ] 学术风格配置正确
- [ ] 中文标签显示正常
- [ ] 图片保存为PNG格式

---

### Task 5.3: 创建Word报告生成器

**目标**：使用python-docx生成完整学术报告

#### 子任务 5.3.1: 创建报告生成服务

**文件**：`/root/stock-mcp/src/server/domain/services/report_generator.py`

**实现内容**：
```python
"""Word报告生成服务"""

from docx import Document
from docx.shared import Inches, Pt, Cm
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
import os
from typing import Dict, Any, List, Optional
import logging

from .qwen_client import QwenClient
from .chart_generator import ChartGenerator

logger = logging.getLogger(__name__)

class ReportGenerator:
    """Word报告生成器"""
    
    def __init__(self, output_dir: str):
        """
        初始化报告生成器
        
        Args:
            output_dir: 报告输出目录
        """
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        
        self.qwen_client = QwenClient()
        self.chart_generator = ChartGenerator(os.path.join(output_dir, 'charts'))
    
    def _set_chinese_font(self, run, font_name='宋体', font_size=12):
        """设置中文字体"""
        run.font.name = font_name
        run._element.rPr.rFonts.set(qn('w:eastAsia'), font_name)
        run.font.size = Pt(font_size)
    
    def _add_heading(self, doc: Document, text: str, level: int = 1):
        """添加标题"""
        heading = doc.add_heading(text, level=level)
        for run in heading.runs:
            self._set_chinese_font(run, '黑体', 14 if level == 1 else 12)
    
    def _add_paragraph(self, doc: Document, text: str, bold: bool = False):
        """添加段落"""
        para = doc.add_paragraph()
        run = para.add_run(text)
        self._set_chinese_font(run, '宋体', 12)
        run.bold = bold
    
    def _add_table(
        self, 
        doc: Document, 
        headers: List[str], 
        rows: List[List[str]],
        title: Optional[str] = None
    ):
        """添加表格"""
        if title:
            self._add_paragraph(doc, title, bold=True)
        
        table = doc.add_table(rows=1 + len(rows), cols=len(headers))
        table.style = 'Table Grid'
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        
        # 表头
        header_cells = table.rows[0].cells
        for i, header in enumerate(headers):
            header_cells[i].text = header
            for para in header_cells[i].paragraphs:
                para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for run in para.runs:
                    run.bold = True
                    self._set_chinese_font(run, '宋体', 10)
        
        # 数据行
        for row_idx, row_data in enumerate(rows):
            row_cells = table.rows[row_idx + 1].cells
            for col_idx, cell_data in enumerate(row_data):
                row_cells[col_idx].text = str(cell_data)
                for para in row_cells[col_idx].paragraphs:
                    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    for run in para.runs:
                        self._set_chinese_font(run, '宋体', 10)
        
        doc.add_paragraph()  # 表格后空一行
    
    def _add_image(self, doc: Document, image_path: str, caption: str = None, width: float = 5.5):
        """添加图片"""
        if os.path.exists(image_path):
            para = doc.add_paragraph()
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = para.add_run()
            run.add_picture(image_path, width=Inches(width))
            
            if caption:
                caption_para = doc.add_paragraph()
                caption_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = caption_para.add_run(caption)
                self._set_chinese_font(run, '宋体', 10)
                run.italic = True
    
    def generate_report(
        self,
        model_result: Dict[str, Any],
        preprocessing_record: Dict[str, Any],
        test_results: Dict[str, Any],
        descriptive_stats: Dict[str, float],
        data_source_info: Dict[str, str],
        model_type: str
    ) -> str:
        """
        生成完整学术报告
        
        Args:
            model_result: 模型结果
            preprocessing_record: 预处理记录
            test_results: 统计检验结果
            descriptive_stats: 描述性统计
            data_source_info: 数据源信息
            model_type: 模型类型
        
        Returns:
            报告文件路径
        """
        doc = Document()
        
        # ========== 第1章：数据说明与处理 ==========
        self._add_heading(doc, '1 数据说明与处理', level=1)
        
        # 1.1 数据来源
        self._add_heading(doc, '1.1 数据来源', level=2)
        source_rows = [
            ['数据名称', data_source_info.get('name', '-')],
            ['数据来源', data_source_info.get('source', '-')],
            ['获取时间', data_source_info.get('fetch_time', '-')],
            ['时间范围', data_source_info.get('date_range', '-')],
            ['原始记录数', str(data_source_info.get('original_count', '-'))]
        ]
        self._add_table(doc, ['项目', '内容'], source_rows, '表1-1 数据来源信息')
        
        # 1.2 数据预处理
        self._add_heading(doc, '1.2 数据预处理', level=2)
        preprocess_rows = [
            ['缺失值填充数量', str(preprocessing_record.get('missing_count', 0))],
            ['异常值填充数量', str(preprocessing_record.get('outlier_count', 0))],
            ['对数转换', '是' if preprocessing_record.get('log_applied') else '否'],
            ['差分阶数', str(preprocessing_record.get('diff_order', 0))],
            ['最终记录数', str(preprocessing_record.get('final_length', '-'))]
        ]
        self._add_table(doc, ['处理步骤', '结果'], preprocess_rows, '表1-2 数据预处理情况')
        
        self._add_paragraph(doc, 
            f"数据预处理采用以下策略：对于缺失值，采用前值填充（Forward Fill）方法；"
            f"对于异常值，使用3σ法则检测后同样采用前值填充。"
            f"共处理{preprocessing_record.get('missing_count', 0)}个缺失值和"
            f"{preprocessing_record.get('outlier_count', 0)}个异常值。"
        )
        
        # 1.3 描述性统计
        self._add_heading(doc, '1.3 描述性统计', level=2)
        
        # ✅ 兼容单变量和多变量两种格式
        # 单变量: {'mean': 0.1, 'std': 0.2, ...}
        # 多变量: {'var1': {'mean': 0.1, ...}, 'var2': {'mean': 0.2, ...}}
        
        first_key = next(iter(descriptive_stats.keys()), None)
        is_multivariate = isinstance(descriptive_stats.get(first_key), dict)
        
        if is_multivariate:
            # 多变量：每个变量一个表格
            for var_name, var_stats in descriptive_stats.items():
                stats_rows = [
                    ['样本量', f"{var_stats.get('count', '-')}"],
                    ['均值', f"{var_stats.get('mean', 0):.4f}"],
                    ['标准差', f"{var_stats.get('std', 0):.4f}"],
                    ['最小值', f"{var_stats.get('min', 0):.4f}"],
                    ['最大值', f"{var_stats.get('max', 0):.4f}"],
                    ['偏度', f"{var_stats.get('skewness', 0):.4f}"],
                    ['峰度', f"{var_stats.get('kurtosis', 0):.4f}"]
                ]
                self._add_table(doc, ['统计量', '值'], stats_rows, f'表1-3 {var_name} 描述性统计')
        else:
            # 单变量：原有逻辑
            stats_rows = [
                ['样本量', f"{descriptive_stats.get('count', '-')}"],
                ['均值', f"{descriptive_stats.get('mean', 0):.4f}"],
                ['标准差', f"{descriptive_stats.get('std', 0):.4f}"],
                ['最小值', f"{descriptive_stats.get('min', 0):.4f}"],
                ['最大值', f"{descriptive_stats.get('max', 0):.4f}"],
                ['偏度', f"{descriptive_stats.get('skewness', 0):.4f}"],
                ['峰度', f"{descriptive_stats.get('kurtosis', 0):.4f}"]
            ]
            self._add_table(doc, ['统计量', '值'], stats_rows, '表1-3 描述性统计')
        
        # ========== 第2章：统计检验结果 ==========
        self._add_heading(doc, '2 统计检验结果', level=1)
        
        # 2.1-2.4 各项检验
        test_mapping = {
            'adf': ('2.1 单位根检验（ADF）', ['ADF统计量', 'p值', '结论']),
            'jb': ('2.2 正态性检验（JB）', ['JB统计量', 'p值', '结论']),
            'ljung_box': ('2.3 自相关检验（Ljung-Box Q）', ['Q统计量', 'p值', '滞后阶数', '结论']),
            'arch_lm': ('2.4 ARCH效应检验', ['LM统计量', 'p值', '滞后阶数', '结论'])
        }
        
        for test_key, (section_title, headers) in test_mapping.items():
            if test_key in test_results:
                self._add_heading(doc, section_title, level=2)
                result = test_results[test_key]
                
                if test_key == 'adf':
                    row = [
                        f"{result.get('test_statistic', '-'):.4f}",
                        f"{result.get('p_value', '-'):.4f}",
                        result.get('conclusion', '-')
                    ]
                elif test_key == 'jb':
                    row = [
                        f"{result.get('test_statistic', '-'):.4f}",
                        f"{result.get('p_value', '-'):.4f}",
                        result.get('conclusion', '-')
                    ]
                elif test_key in ['ljung_box', 'arch_lm']:
                    stat_key = 'test_statistic' if test_key == 'ljung_box' else 'lm_statistic'
                    p_key = 'p_value' if test_key == 'ljung_box' else 'lm_p_value'
                    row = [
                        f"{result.get(stat_key, '-'):.4f}",
                        f"{result.get(p_key, '-'):.4f}",
                        str(result.get('selected_lag', '-')),
                        result.get('conclusion', '-')
                    ]
                
                self._add_table(doc, headers, [row])
        
        # ========== 2.5-2.8 多变量检验（如果存在） ==========
        
        # 2.5 相关性矩阵
        if 'pearson_correlation' in test_results:
            self._add_heading(doc, '2.5 相关性分析', level=2)
            corr_result = test_results['pearson_correlation']
            corr_matrix = corr_result.get('correlation_matrix', {})
            
            if corr_matrix:
                # 构建相关系数矩阵表格
                variables = list(corr_matrix.keys())
                headers = ['变量'] + variables
                rows = []
                for var in variables:
                    row_data = [var]
                    for other_var in variables:
                        val = corr_matrix.get(var, {}).get(other_var, '-')
                        if isinstance(val, (int, float)):
                            row_data.append(f"{val:.4f}")
                        else:
                            row_data.append(str(val))
                    rows.append(row_data)
                
                self._add_table(doc, headers, rows, '表2-5 Pearson相关系数矩阵')
                
                # 高相关提示
                high_corr = corr_result.get('high_correlation_pairs', [])
                if high_corr:
                    pairs_text = "、".join([f"{p['var1']}-{p['var2']}({p['correlation']:.2f})" for p in high_corr[:5]])
                    self._add_paragraph(doc, f"注：相关系数绝对值大于0.7的变量对：{pairs_text}")
        
        # 2.6 VIF多重共线性检验
        if 'vif' in test_results:
            self._add_heading(doc, '2.6 多重共线性检验 (VIF)', level=2)
            vif_result = test_results['vif']
            vif_values = vif_result.get('vif_values', [])
            
            if vif_values:
                rows = []
                for item in vif_values:
                    var_name = item.get('variable', '-')
                    vif_val = item.get('vif', 0)
                    flag = '⚠ 共线' if item.get('has_collinearity') else '正常'
                    rows.append([var_name, f"{vif_val:.4f}", flag])
                
                self._add_table(doc, ['变量', 'VIF值', '状态'], rows, '表2-6 方差膨胀因子(VIF)检验结果')
                self._add_paragraph(doc, "注：VIF > 10 表示存在严重多重共线性。")
        
        # 2.7 Johansen协整检验
        if 'johansen' in test_results:
            self._add_heading(doc, '2.7 协整检验 (Johansen)', level=2)
            johansen_result = test_results['johansen']
            
            trace_test = johansen_result.get('trace_test', {})
            trace_stats = trace_test.get('statistics', [])
            trace_crit = trace_test.get('critical_values_95pct', [])
            
            if trace_stats and trace_crit:
                rows = []
                for i, (stat, crit) in enumerate(zip(trace_stats, trace_crit)):
                    conclusion = "拒绝H0" if stat > crit else "接受H0"
                    rows.append([f"r ≤ {i}", f"{stat:.4f}", f"{crit:.4f}", conclusion])
                
                self._add_table(doc, ['原假设', '迹统计量', '临界值(5%)', '结论'], rows, '表2-7 Johansen协整检验结果')
                
                rank = johansen_result.get('recommended_rank', 0)
                self._add_paragraph(doc, f"协整秩为 {rank}，{'表明变量间存在长期均衡关系' if rank > 0 else '未发现协整关系'}。")
        
        # 2.8 格兰杰因果检验
        if 'granger_causality' in test_results:
            self._add_heading(doc, '2.8 格兰杰因果检验', level=2)
            granger_result = test_results['granger_causality']
            causality_matrix = granger_result.get('causality_matrix', {})
            
            if causality_matrix:
                rows = []
                for pair_key, pair_info in causality_matrix.items():
                    if 'error' not in pair_info:
                        p_val = pair_info.get('p_value', 1)
                        lag = pair_info.get('optimal_lag', '-')
                        conclusion = "存在因果" if pair_info.get('is_granger_cause') else "不存在因果"
                        rows.append([pair_key, str(lag), f"{p_val:.4f}", conclusion])
                
                if rows:
                    self._add_table(doc, ['因果假设', '最优滞后', 'p值', '结论'], rows, '表2-8 格兰杰因果检验结果')
                    self._add_paragraph(doc, "注：格兰杰因果仅表示统计上的预测关系，不代表真实因果。")
        
        # ========== 第3章：模型构建与结果 ==========
        self._add_heading(doc, '3 模型构建与结果', level=1)
        
        # 3.1 模型选择依据
        self._add_heading(doc, '3.1 模型选择依据', level=2)
        self._add_paragraph(doc, 
            f"根据前述统计检验结果，本研究选择{model_type}模型进行时间序列建模分析。"
        )
        
        # 3.2 模型参数设定
        self._add_heading(doc, '3.2 模型参数设定', level=2)
        
        params = model_result.get('parameters', {})
        if model_type in ['ARIMA', 'ARMA']:
            order = model_result.get('selected_order', {})
            self._add_paragraph(doc, 
                f"模型阶数：p={order.get('p', '-')}, d={order.get('d', '-')}, q={order.get('q', '-')}"
            )
        elif model_type in ['GARCH', 'ARCH']:
            vol_eq = model_result.get('volatility_equation', {})
            mean_eq = model_result.get('mean_equation', {})
            dist = model_result.get('distribution', 'normal')
            self._add_paragraph(doc,
                f"波动率方程阶数：GARCH({vol_eq.get('p', '-')}, {vol_eq.get('q', '-')})\n"
                f"均值方程：AR({mean_eq.get('order', '-')})\n"
                f"分布假设：{dist}"
            )
        elif model_type in ['VAR', 'VECM']:
            self._add_paragraph(doc,
                f"滞后阶数：{model_result.get('selected_lag', model_result.get('lags', '-'))}"
            )
            if model_type == 'VECM':
                self._add_paragraph(doc,
                    f"协整秩：{model_result.get('cointegration_rank', '-')}"
                )
        
        # 3.3 参数估计结果
        self._add_heading(doc, '3.3 参数估计结果', level=2)
        
        all_params = params.get('all_params', params.get('coefficients', {}))
        p_values = params.get('p_values', {})
        
        param_rows = []
        for param_name, value in all_params.items():
            p_val = p_values.get(param_name, '-')
            if isinstance(p_val, float):
                p_val = f"{p_val:.4f}"
            param_rows.append([param_name, f"{value:.6f}" if isinstance(value, float) else str(value), str(p_val)])
        
        if param_rows:
            self._add_table(doc, ['参数', '估计值', 'p值'], param_rows, '表3-1 参数估计结果')
        
        # 3.4 拟合优度
        self._add_heading(doc, '3.4 拟合优度指标', level=2)
        metrics = model_result.get('metrics', {})
        metrics_rows = [
            ['R²', f"{metrics.get('r2', metrics.get('r2_average', '-')):.4f}" if metrics.get('r2') or metrics.get('r2_average') else '-'],
            ['AIC', f"{metrics.get('aic', '-'):.4f}" if metrics.get('aic') else '-'],
            ['BIC', f"{metrics.get('bic', '-'):.4f}" if metrics.get('bic') else '-'],
            ['Log-Likelihood', f"{metrics.get('log_likelihood', '-'):.4f}" if metrics.get('log_likelihood') else '-']
        ]
        self._add_table(doc, ['指标', '值'], metrics_rows, '表3-2 拟合优度指标')
        
        # 3.5 残差诊断
        self._add_heading(doc, '3.5 残差诊断', level=2)
        self._add_paragraph(doc, "模型残差的诊断检验结果详见图表部分的残差分析图。")
        
        # 3.6 经济学含义分析（AI生成）
        self._add_heading(doc, '3.6 经济学含义分析', level=2)
        
        # 调用Qwen生成分析
        economic_analysis = self.qwen_client.generate_economic_analysis(
            model_type=model_type,
            model_params=params,
            metrics=metrics,
            test_results=test_results
        )
        self._add_paragraph(doc, economic_analysis)
        
        # ========== 第4章：可视化图表 ==========
        self._add_heading(doc, '4 可视化图表', level=1)
        
        # 生成图表
        chart_paths = self.chart_generator.generate_all_charts(model_result, model_type)
        
        chart_titles = {
            'time_series': '图4-1 原始数据时间序列图',
            'acf': '图4-2 自相关函数图（ACF）',
            'pacf': '图4-3 偏自相关函数图（PACF）',
            'residuals_series': '图4-4 残差时间序列图',
            'residuals_hist': '图4-5 残差直方图',
            'qq_plot': '图4-6 残差Q-Q图',
            'fitted_vs_actual': '图4-7 拟合值与实际值对比图',
            'conditional_volatility': '图4-8 条件波动率图',
            'impulse_response': '图4-9 脉冲响应函数图',
            'variance_decomposition': '图4-10 方差分解图'
        }
        
        for chart_key, chart_path in chart_paths.items():
            caption = chart_titles.get(chart_key, chart_key)
            self._add_image(doc, chart_path, caption)
        
        # 保存报告
        import time
        timestamp = int(time.time())
        report_filename = f"report_{model_type}_{timestamp}.docx"
        report_path = os.path.join(self.output_dir, report_filename)
        
        doc.save(report_path)
        logger.info(f"报告已生成: {report_path}")
        
        return report_path
```

**验证标准**：
- [ ] 报告生成器创建成功
- [ ] 4章结构完整
- [ ] 表格格式正确
- [ ] 图片嵌入成功
- [ ] AI生成文本集成
- [ ] 中文字体显示正确

---

### Task 5.4: 创建报告API端点

**文件**：`/root/stock-mcp/src/server/api/routes/reports.py`

**实现内容**：
```python
"""报告生成API路由"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os
from src.server.domain.services.report_generator import ReportGenerator
from src.server.utils.request_context import get_current_user_id
from src.server.utils.logger import logger

router = APIRouter(prefix="/api/reports", tags=["reports"])

class ReportRequest(BaseModel):
    """报告生成请求"""
    model_result_path: str  # 模型结果JSON路径
    preprocessing_record: Dict[str, Any]
    test_results: Dict[str, Any]
    descriptive_stats: Dict[str, Any]  # ✅ 支持单变量Dict[str, float]和多变量Dict[str, Dict[str, float]]
    data_source_info: Dict[str, str]
    model_type: str

@router.post("/generate")
async def generate_report(request: ReportRequest):
    """生成学术报告"""
    try:
        user_id = get_current_user_id() or "anonymous"
        
        # 读取模型结果
        import json
        with open(request.model_result_path, 'r', encoding='utf-8') as f:
            model_result = json.load(f)
        
        # 创建报告目录
        output_dir = f"/root/librechat_user_data/{user_id}/reports"
        
        generator = ReportGenerator(output_dir)
        report_path = generator.generate_report(
            model_result=model_result,
            preprocessing_record=request.preprocessing_record,
            test_results=request.test_results,
            descriptive_stats=request.descriptive_stats,
            data_source_info=request.data_source_info,
            model_type=request.model_type
        )
        
        return {
            "success": True,
            "report_path": report_path,
            "message": "报告生成成功"
        }
    
    except Exception as e:
        logger.error(f"报告生成失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/download/{filename}")
async def download_report(filename: str):
    """下载报告"""
    try:
        user_id = get_current_user_id() or "anonymous"
        file_path = f"/root/librechat_user_data/{user_id}/reports/{filename}"
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="报告不存在")
        
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

## ⚠️ 注意事项

### 🛑 1. Matplotlib后端配置（致命问题）
**问题**：Linux无头服务器没有X11显示服务，直接`import matplotlib.pyplot`会报错`_tkinter.TclError: no display name`
**解决方案**：必须在`import pyplot`之前执行`matplotlib.use('Agg')`
```python
import matplotlib
matplotlib.use('Agg')  # 必须在import pyplot之前！
import matplotlib.pyplot as plt
```

### 2. Qwen API调用限制
**问题**：可能有频率限制或配额
**解决方案**：指数退避 + 降级模板

### 3. 中文字体问题
**问题**：服务器可能没有中文字体
**解决方案**：安装SimHei或使用matplotlib内置字体

### 4. 图片大小
**问题**：图片过大导致Word文件臃肿
**解决方案**：控制DPI为150，合理设置figure size

### 5. 多变量数据格式兼容
**问题**：VAR/VECM是多变量模型，描述性统计和时序图需要支持嵌套结构
**解决方案**：
- `descriptive_stats`支持`Dict[str, float]`（单变量）和`Dict[str, Dict[str, float]]`（多变量）
- `plot_time_series`支持`List[float]`和`Dict[str, List[float]]`

---

## ✅ 阶段验收标准

### 基础功能
1. **Qwen集成**：AI生成文本正常，降级方案可用
2. **图表生成**：10种图表全部可生成
3. **Word报告**：4章结构完整，格式规范
4. **API可用**：生成和下载端点正常

### 本次新增验证点（必须通过）
- [ ] `matplotlib.use('Agg')`在import pyplot之前设置
- [ ] `plot_time_series`支持多变量Dict格式，自动绘制多条线
- [ ] 报告2.5-2.8节（相关矩阵、VIF、Johansen、Granger）正确生成表格
- [ ] 多变量描述性统计为每个变量生成独立表格
- [ ] `ReportRequest.descriptive_stats`类型为`Dict[str, Any]`

---

*本文档版本：v1.1*  
*最后更新：2026-01-15*

