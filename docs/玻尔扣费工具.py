import requests
import time
import random


def bohrium_charge(access_key, client_name, event_value, sku_id, biz_no=None):
    """
    玻尔积分扣费主函数
    
    Args:
        access_key: 访问密钥
        client_name: 客户端名称
        event_value: 事件值（扣费金额）
        sku_id: SKU ID
        biz_no: 业务单号（可选，未提供则自动生成）
    
    Returns:
        扣费接口返回的响应文本
    """
    # 自动生成业务单号
    if not biz_no or not str(biz_no).isdigit():
        timestamp = int(time.time())
        rand_part = random.randint(1000, 9999)
        biz_no = int(f"{timestamp}{rand_part}")
    else:
        biz_no = int(biz_no)
    
    # 构建请求
    url = "https://openapi.dp.tech/openapi/v1/api/integral/consume"
    headers = {
        "accessKey": access_key,
        "x-app-key": client_name,
        "Content-Type": "application/json"
    }
    payload = {
        "bizNo": biz_no,
        "changeType": 1,
        "eventValue": int(event_value),
        "skuId": int(sku_id),
        "scene": "appCustomizeCharge"
    }
    
    # 发起请求
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        return resp.text
    except Exception as e:
        return str(e)
