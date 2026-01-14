import http.cookies
from http.cookies import SimpleCookie

import streamlit as st
from streamlit.runtime import Runtime
from streamlit.runtime.scriptrunner import get_script_run_ctx

http.cookies._is_legal_key = lambda _: True

def _get_session_id():
    context = get_script_run_ctx()
    if not context:
        return
    return context.session_id

def _get_current_request():
    session_id = _get_session_id()
    if not session_id:
        return None
    runtime = Runtime._instance
    if not runtime:
        return
    client = runtime.get_client(session_id)
    if not client:
        return
    return client.request

def get_request_headers():
    request = _get_current_request()
    return request.headers if request else None

def get_cookies() -> dict:
    headers = get_request_headers()
    if not headers:
        return {}
    cookies = headers.get("Cookie")
    if not cookies:
        return {}
    cookie = SimpleCookie()
    cookie.load(cookies)
    return {k: v.value for k, v in cookie.items()}

def get_brm_key():
    cookies = get_cookies()
    access_key = cookies.get("appAccessKey", None)
    app_key = cookies.get("clientName", None)
    if access_key is None or app_key is None:
        raise ValueError("Cannot find access key and app key")
    return access_key, app_key

access_key, app_key = get_brm_key()
client = OpenSDK(access_key=access_key, app_key=app_key)
user_info = client.user.get_info()
user_id = user_info["data"]["user_id"]