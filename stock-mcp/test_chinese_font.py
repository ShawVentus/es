#!/usr/bin/env python
"""
中文字体显示测试脚本
用于验证ChartGenerator生成的图表中文字符是否正常显示
"""

import sys
sys.path.insert(0, '/root/stock-mcp/src')

from server.domain.services.chart_generator import ChartGenerator
import tempfile
import numpy as np
import os

def test_chinese_font():
    """测试所有图表类型的中文显示"""

    print("=" * 60)
    print("中文字体显示测试")
    print("=" * 60)

    # 创建临时目录
    temp_dir = tempfile.mkdtemp(prefix='chart_test_')
    chart_gen = ChartGenerator(temp_dir)

    test_results = []

    # 测试1: 时间序列图
    print("\n[1/7] 测试时间序列图...")
    try:
        chart = chart_gen.plot_time_series(
            data=[1, 4, 2, 5, 3, 6, 4, 7, 5, 8],
            title='上证指数收盘价时间序列图',
            ylabel='收盘价（元）'
        )
        test_results.append(('时间序列图', chart, True))
        print(f"  ✅ 成功: {chart}")
    except Exception as e:
        test_results.append(('时间序列图', str(e), False))
        print(f"  ❌ 失败: {e}")

    # 测试2: ACF图
    print("\n[2/7] 测试自相关函数图...")
    try:
        chart = chart_gen.plot_acf_chart(
            data=[1, 4, 2, 5, 3, 6, 4, 2, 5, 7, 3, 8, 4, 6, 5],
            lags=10,
            title='自相关函数图 (ACF)'
        )
        test_results.append(('ACF图', chart, True))
        print(f"  ✅ 成功: {chart}")
    except Exception as e:
        test_results.append(('ACF图', str(e), False))
        print(f"  ❌ 失败: {e}")

    # 测试3: PACF图
    print("\n[3/7] 测试偏自相关函数图...")
    try:
        chart = chart_gen.plot_pacf_chart(
            data=[1, 4, 2, 5, 3, 6, 4, 2, 5, 7, 3, 8, 4, 6, 5],
            lags=10,
            title='偏自相关函数图 (PACF)'
        )
        test_results.append(('PACF图', chart, True))
        print(f"  ✅ 成功: {chart}")
    except Exception as e:
        test_results.append(('PACF图', str(e), False))
        print(f"  ❌ 失败: {e}")

    # 测试4: 残差时间序列图
    print("\n[4/7] 测试残差时间序列图...")
    try:
        residuals = np.random.normal(0, 0.5, 50).tolist()
        chart = chart_gen.plot_residuals_series(
            residuals=residuals,
            title='模型残差时间序列图'
        )
        test_results.append(('残差序列图', chart, True))
        print(f"  ✅ 成功: {chart}")
    except Exception as e:
        test_results.append(('残差序列图', str(e), False))
        print(f"  ❌ 失败: {e}")

    # 测试5: 残差直方图（含中文标签）
    print("\n[5/7] 测试残差直方图...")
    try:
        residuals = np.random.normal(0, 1, 200).tolist()
        chart = chart_gen.plot_residuals_histogram(
            residuals=residuals,
            title='残差分布直方图'
        )
        test_results.append(('残差直方图', chart, True))
        print(f"  ✅ 成功: {chart}")
    except Exception as e:
        test_results.append(('残差直方图', str(e), False))
        print(f"  ❌ 失败: {e}")

    # 测试6: QQ图
    print("\n[6/7] 测试残差Q-Q图...")
    try:
        residuals = np.random.normal(0, 1, 100).tolist()
        chart = chart_gen.plot_qq(
            residuals=residuals,
            title='残差正态性Q-Q图'
        )
        test_results.append(('Q-Q图', chart, True))
        print(f"  ✅ 成功: {chart}")
    except Exception as e:
        test_results.append(('Q-Q图', str(e), False))
        print(f"  ❌ 失败: {e}")

    # 测试7: 拟合对比图（含中文图例）
    print("\n[7/7] 测试拟合值vs实际值对比图...")
    try:
        actual = np.sin(np.linspace(0, 4*np.pi, 50)).tolist()
        fitted = (np.sin(np.linspace(0, 4*np.pi, 50)) + np.random.normal(0, 0.1, 50)).tolist()
        chart = chart_gen.plot_fitted_vs_actual(
            actual=actual,
            fitted=fitted,
            title='ARIMA(2,1,2)模型拟合效果对比'
        )
        test_results.append(('拟合对比图', chart, True))
        print(f"  ✅ 成功: {chart}")
    except Exception as e:
        test_results.append(('拟合对比图', str(e), False))
        print(f"  ❌ 失败: {e}")

    # 汇总结果
    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)

    success_count = sum(1 for _, _, success in test_results if success)
    total_count = len(test_results)

    for name, path, success in test_results:
        status = "✅ 通过" if success else "❌ 失败"
        print(f"{status} {name:15s} {path if success else ''}")

    print("\n" + "-" * 60)
    print(f"总计: {success_count}/{total_count} 通过")

    if success_count == total_count:
        print("\n🎉 所有测试通过！中文字体配置成功。")
        print(f"\n📁 测试图片保存在: {temp_dir}")
        print("\n请手动打开图片文件，确认以下中文字符正常显示：")
        print("  - 标题：股票、指数、收盘价、残差、拟合、对比等")
        print("  - 坐标轴：日期、观测序号、值、滞后阶数、密度等")
        print("  - 图例：实际值、拟合值、正态分布等")
        return 0
    else:
        print("\n⚠️ 部分测试失败，请检查错误信息。")
        return 1

if __name__ == '__main__':
    exit_code = test_chinese_font()
    sys.exit(exit_code)
