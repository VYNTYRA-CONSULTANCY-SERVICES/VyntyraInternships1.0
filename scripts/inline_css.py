from pathlib import Path

workspace = Path("c:/Users/Jamia/Vyntyra Academy")
index_path = workspace / "index.html"
style_path = workspace / "assets" / "css" / "premium-style.css"

index_text = index_path.read_text(encoding="utf-8")
style_text = style_path.read_text(encoding="utf-8")
style_text = style_text.replace("    width: 140px;\n    height: 70px;", "    width: 200px;\n    height: 100px;", 1)

if "<head>" not in index_text or "</head>" not in index_text:
    raise RuntimeError("The expected head tags were not found in index.html")

prefix, rest = index_text.split("<head>", 1)
old_head, suffix = rest.split("</head>", 1)

new_head_inner = (
    "\n"
    "    <meta charset=\"UTF-8\">\n"
    "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
    "    <title>Workshop Registration | Vyntyra Academy</title>\n"
    "    <link rel=\"icon\" href=\"vyntyra.png\" type=\"image/png\">\n"
    "    <link rel=\"stylesheet\" href=\"https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css\">\n"
    "    <link rel=\"stylesheet\" href=\"https://cdn.jsdelivr.net/gh/devicons/devicon@latest/devicon.min.css\">\n"
    "    <style>\n"
    f"{style_text}"
    "\n    </style>\n"
)

new_content = prefix + "<head>" + new_head_inner + "</head>" + suffix
index_path.write_text(new_content, encoding="utf-8")
