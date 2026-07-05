import re
import glob
import os

base = r"c:\xampp\htdocs\LenLearn\docs\thesis"
files = sorted(
    set(
        glob.glob(os.path.join(base, "*Checklist*.html"))
        + glob.glob(os.path.join(base, "C3*.html"))
        + glob.glob(os.path.join(base, "D2*.html"))
    )
)
for f in files:
    text = open(f, encoding="utf-8").read()
    done = text.count('status status-done">Completed')
    tasks = text.count("task task-sub")
    print(f"{os.path.basename(f):50} completed={done:2}  task-sub={tasks:2}")
