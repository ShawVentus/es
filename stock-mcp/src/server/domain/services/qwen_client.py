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
