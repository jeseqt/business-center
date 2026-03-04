import sys
import json
import re
import requests
import os

# 配置
README_PATH = 'README_PARTNER.md'
# 这里的 URL 需要替换为实际的测试环境 URL，或者从环境变量读取
BASE_URL = os.environ.get('API_BASE_URL', 'https://your-project-ref.supabase.co/functions/v1')
TEST_APP_ID = os.environ.get('TEST_APP_ID', '00000000-0000-0000-0000-000000000000')

def extract_urls(text):
    """提取文档中的所有 URL"""
    url_pattern = r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'
    return re.findall(url_pattern, text)

def extract_json_blocks(text):
    """提取文档中的 JSON 代码块"""
    json_pattern = r'```json\s*([\s\S]*?)\s*```'
    return re.findall(json_pattern, text)

def validate_json(json_str):
    """验证 JSON 格式是否合法"""
    try:
        # 去除注释 (简单的 // 处理)
        lines = json_str.split('\n')
        cleaned_lines = []
        for line in lines:
            # 移除行尾注释 //
            line = re.sub(r'//.*$', '', line)
            cleaned_lines.append(line)
        cleaned_json = '\n'.join(cleaned_lines)
        
        json.loads(cleaned_json)
        return True, None
    except json.JSONDecodeError as e:
        return False, str(e)

def check_url_accessibility(url):
    """检查 URL 是否可访问 (HEAD 请求)"""
    # 跳过示例 URL
    if 'your-project-ref' in url or 'your-domain' in url or 'localhost' in url or 'example.com' in url:
        return 'SKIPPED (Example URL)'
    
    try:
        response = requests.head(url, timeout=5)
        if response.status_code < 400:
            return 'OK'
        else:
            return f'FAIL ({response.status_code})'
    except Exception as e:
        return f'FAIL ({str(e)})'

def main():
    print(f"Loading {README_PATH}...")
    try:
        with open(README_PATH, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: {README_PATH} not found.")
        sys.exit(1)

    print("\n--- 1. Validating JSON Schemas ---")
    json_blocks = extract_json_blocks(content)
    errors = 0
    for i, block in enumerate(json_blocks):
        is_valid, error = validate_json(block)
        status = "OK" if is_valid else "FAIL"
        print(f"JSON Block #{i+1}: {status}")
        if not is_valid:
            print(f"  Error: {error}")
            print(f"  Snippet: {block[:50]}...")
            errors += 1
    
    print(f"\nJSON Validation Complete. {len(json_blocks)} blocks checked, {errors} errors found.")

    print("\n--- 2. Checking URL Accessibility ---")
    urls = extract_urls(content)
    unique_urls = list(set(urls))
    for url in unique_urls:
        status = check_url_accessibility(url)
        print(f"URL: {url} -> {status}")

    print("\n--- 3. Content Completeness Check ---")
    required_sections = [
        "项目背景", "接入前准备", "快速开始", "接口清单", 
        "鉴权", "SDK", "Webhook", "错误码"
    ]
    missing_sections = []
    for section in required_sections:
        if section not in content and section.replace(" ", "") not in content: # 简单模糊匹配
             # 尝试英文匹配
             english_map = {
                 "项目背景": "Background", "接入前准备": "Preparation", "快速开始": "Quick Start",
                 "接口清单": "API Reference", "鉴权": "Authentication", "SDK": "SDK",
                 "Webhook": "Webhook", "错误码": "Error"
             }
             if english_map.get(section, "XYZ") not in content:
                missing_sections.append(section)
    
    if missing_sections:
        print(f"Warning: Potential missing sections: {', '.join(missing_sections)}")
    else:
        print("All required sections structure detected.")

    if errors > 0:
        sys.exit(1)
    else:
        print("\nSUCCESS: Document validation passed.")
        sys.exit(0)

if __name__ == "__main__":
    main()
