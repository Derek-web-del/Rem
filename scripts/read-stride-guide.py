import re
import zipfile

path = r"c:\Users\User\Downloads\STRIDE_Pentesting_Full_Guide.docx"
with zipfile.ZipFile(path) as z:
    xml = z.read("word/document.xml").decode("utf-8")
text = re.sub(r"</w:p>", "\n", xml)
text = re.sub(r"<[^>]+>", "", text)
for ent, ch in [("&quot;", '"'), ("&gt;", ">"), ("&lt;", "<"), ("&amp;", "&")]:
    text = text.replace(ent, ch)
# extract test case headings
for m in re.finditer(r"Test Case [A-Z]-\d+[^\n]*|^\d+\. [A-Z][^\n]+", text, re.M):
    print(m.group()[:100])
print("---")
idx = text.find("4. Repudiation")
if idx < 0:
    idx = text.find("Repudiation")
print(text[idx : idx + 9000])
