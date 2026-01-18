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

# ========== 配置中文字体（防御性编程）==========
# 手动注册系统中的HeiTi字体
HEITI_FONT_PATH = '/usr/share/fonts/truetype/heiti/HeiTi.ttf'
if os.path.exists(HEITI_FONT_PATH):
    try:
        fm.fontManager.addfont(HEITI_FONT_PATH)
        logger.info(f"✅ 已注册中文字体: {HEITI_FONT_PATH}")
    except Exception as e:
        logger.warning(f"⚠️ 注册字体失败: {e}")

# 配置字体回退链（按优先级）
# 注意：HeiTi.ttf的实际字体名称是"经典平黑简"
plt.rcParams['font.sans-serif'] = ['经典平黑简', 'WenQuanYi Zen Hei', 'SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False  # 解决负号显示问题

# 启动时验证中文字体是否可用
available_fonts = {f.name for f in fm.fontManager.ttflist}
chinese_fonts_found = [font for font in ['经典平黑简', 'WenQuanYi Zen Hei', 'SimHei'] if font in available_fonts]
if chinese_fonts_found:
    logger.info(f"✅ 中文字体配置成功，可用字体: {chinese_fonts_found[0]}")
else:
    logger.error(f"⚠️ 未找到任何中文字体！图表中的中文可能显示为方框。可用字体示例: {list(available_fonts)[:5]}")

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

        # ⚠️ 关键：update()后必须重新设置中文字体，否则会被重置为默认值
        plt.rcParams['font.sans-serif'] = ['WenQuanYi Zen Hei', 'DejaVu Sans']
        plt.rcParams['axes.unicode_minus'] = False

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
            # 过滤None值（NaN被转换为None以支持JSON序列化）
            clean_cond_vol = [v for v in cond_vol if v is not None]
            if clean_cond_vol:
                chart_paths['conditional_volatility'] = self.plot_conditional_volatility(clean_cond_vol)

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
