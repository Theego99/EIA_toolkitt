"""
Test the deployed Lambda function.
Usage: python test_lambda.py https://your-url.lambda-url.ap-northeast-1.on.aws
       python test_lambda.py  # runs locally (no URL needed)
"""
import sys, json, base64, subprocess

LOCAL_MODE = len(sys.argv) < 2

payload = {
    "report_type": "preparatory",
    "project": {
        "name": "北海道洋上風力発電EIA",
        "client": "J-Power株式会社",
        "pref": "北海道",
        "area": "2400",
        "stage": 4,
        "manager": "田中 誠一",
    },
    "species": [
        {
            "name": "オジロワシ", "latin": "Haliaeetus albicilla",
            "type": "鳥類", "status": "VU", "protected": True, "count": 2,
            "location": "調査地点A-3", "obs_date": "2026-05-12",
            "notes": "営巣確認。繁殖期中の工事は避けること。"
        },
        {
            "name": "エゾシカ", "latin": "Cervus nippon yesoensis",
            "type": "哺乳類", "status": "LC", "protected": False, "count": 8,
            "location": "調査地点B-1", "obs_date": "2026-05-14", "notes": ""
        },
    ]
}

if LOCAL_MODE:
    print("Running locally...")
    import sys; sys.path.insert(0, '.')
    from lambda_function import lambda_handler
    event = {
        "requestContext": {"http": {"method": "POST"}},
        "body": json.dumps(payload)
    }
    result = lambda_handler(event, None)
    if result.get("isBase64Encoded"):
        with open("test_output.docx", "wb") as f:
            f.write(base64.b64decode(result["body"]))
        print("✅ Written to test_output.docx")
    else:
        print("❌ Error:", result.get("body"))
else:
    import urllib.request, urllib.error
    url = sys.argv[1].rstrip("/")
    print(f"Testing: {url}")
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
            with open("test_output.docx", "wb") as f:
                f.write(data)
            print("✅ Written to test_output.docx")
            print(f"   File size: {len(data):,} bytes")
    except urllib.error.HTTPError as e:
        print(f"❌ HTTP {e.code}: {e.read().decode()}")
