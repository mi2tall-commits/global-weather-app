import re

with open('js/app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

ids = re.findall(r"getElementById\(['\"](.*?)['\"]\)", app_js)
print(f"Total IDs checked: {len(ids)}")
for x in set(ids):
    if f'id="{x}"' not in html and f"id='{x}'" not in html:
        print(f"MISSING ID: {x}")
