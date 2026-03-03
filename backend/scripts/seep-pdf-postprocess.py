import sys
from pathlib import Path

try:
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import ContentStream, FloatObject, TextStringObject, NameObject
except Exception as exc:
    print(f"IMPORT_ERROR:{exc}", file=sys.stderr)
    sys.exit(2)


GREEN_RGB = (0.4549, 0.7451, 0.0745)
ORANGE_RGB = (0.9647, 0.4470, 0.1020)


def is_close(a, b, tol=0.06):
    return abs(a - b) <= tol


def is_target_green(values):
    if len(values) != 3:
        return False
    try:
        r, g, b = [float(v) for v in values]
    except Exception:
        return False
    return (
        is_close(r, GREEN_RGB[0])
        and is_close(g, GREEN_RGB[1])
        and is_close(b, GREEN_RGB[2])
    )


def replace_text(value):
    if not isinstance(value, str):
        return value
    out = value.replace("Multe portoghesi", "Multe italiane")
    out = out.replace("Multe portughesi", "Multe italiane")
    out = out.replace("Multe portuguesi", "Multe italiane")
    return out


def process_content_stream(page, reader):
    contents = page.get_contents()
    if not contents:
        return
    cs = ContentStream(contents, reader)
    for op in cs.operations:
        operands, operator = op
        if operator in (b"rg", b"RG") and is_target_green(operands):
            op[0] = [
                FloatObject(ORANGE_RGB[0]),
                FloatObject(ORANGE_RGB[1]),
                FloatObject(ORANGE_RGB[2]),
            ]
            continue

        if operator == b"Tj" and operands:
            if isinstance(operands[0], TextStringObject):
                operands[0] = TextStringObject(replace_text(str(operands[0])))
            continue

        if operator == b"TJ" and operands and isinstance(operands[0], list):
            arr = operands[0]
            for i, item in enumerate(arr):
                if isinstance(item, TextStringObject):
                    arr[i] = TextStringObject(replace_text(str(item)))

    page[NameObject("/Contents")] = cs


def main():
    if len(sys.argv) != 3:
        print("Usage: seep-pdf-postprocess.py <input.pdf> <output.pdf>", file=sys.stderr)
        return 1

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    if not input_path.exists():
        print(f"INPUT_NOT_FOUND:{input_path}", file=sys.stderr)
        return 1

    reader = PdfReader(str(input_path))
    writer = PdfWriter()

    for page in reader.pages:
        process_content_stream(page, reader)
        writer.add_page(page)

    with output_path.open("wb") as f:
        writer.write(f)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
