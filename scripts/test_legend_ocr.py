#!/usr/bin/env python3
import argparse
import json
import os
import sys
from pathlib import Path

import paddle_legend_ocr as legend_ocr


def save_debug_crop(path, image, cv2):
    path.parent.mkdir(parents=True, exist_ok=True)
    if image is None or image.size == 0:
        return
    if len(image.shape) == 3 and image.shape[2] == 4:
        output = cv2.cvtColor(image, cv2.COLOR_RGBA2BGRA)
    elif len(image.shape) == 3 and image.shape[2] == 3:
        output = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    else:
        output = image
    cv2.imwrite(str(path), output)


def save_overlay(path, rgba, boxes, cv2):
    path.parent.mkdir(parents=True, exist_ok=True)
    overlay = cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGR)
    for index, box in enumerate(boxes, start=1):
        x = int(box["x"])
        y = int(box["y"])
        width = int(box["width"])
        height = int(box["height"])
        cv2.rectangle(overlay, (x, y), (x + width, y + height), (0, 0, 255), 2)
        cv2.putText(
            overlay,
            str(index),
            (x, max(12, y - 4)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (0, 0, 255),
            1,
            cv2.LINE_AA,
        )
    cv2.imwrite(str(path), overlay)


def main():
    parser = argparse.ArgumentParser(description="Test PaddleOCR legend recognition on one cropped legend image.")
    parser.add_argument("image", help="Path to the cropped legend image.")
    parser.add_argument("--max-items", type=int, default=80, help="Maximum legend items to detect.")
    parser.add_argument(
        "--debug-dir",
        default="tmp/legend-ocr-debug",
        help="Directory for detected item/code/count crop images.",
    )
    parser.add_argument("--json", action="store_true", help="Print compact JSON only.")
    args = parser.parse_args()

    image_path = Path(args.image).resolve()
    if not image_path.is_file():
        raise SystemExit(f"Image not found: {image_path}")

    os.environ.setdefault("PADDLE_PDX_MODEL_SOURCE", "modelscope")
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

    dependencies = legend_ocr.import_dependencies()
    if not dependencies:
        raise SystemExit(1)
    cv2, np, PaddleOCR = dependencies

    image = cv2.imread(str(image_path), cv2.IMREAD_UNCHANGED)
    rgba = legend_ocr.to_rgba(image, cv2)
    if rgba is None:
        raise SystemExit("Could not decode image.")

    boxes = legend_ocr.detect_legend_item_boxes(rgba, args.max_items, np)
    ocr = legend_ocr.create_ocr(PaddleOCR)

    debug_dir = Path(args.debug_dir).resolve()
    save_overlay(debug_dir / "overlay_boxes.png", rgba, boxes, cv2)
    rows = []
    for index, box in enumerate(boxes, start=1):
        item_crop = rgba[
            box["y"] : box["y"] + box["height"],
            box["x"] : box["x"] + box["width"],
        ]
        code_rgba = legend_ocr.crop_box(rgba, box, 0.02, 0.58)
        count_rgba = legend_ocr.crop_box(rgba, box, 0.56, 0.98)
        code_crop = legend_ocr.prepare_text_crop(code_rgba, cv2, np, invert_threshold=185)
        count_crop = legend_ocr.prepare_text_crop(count_rgba, cv2, np, invert_threshold=150)

        code_text, code_score = legend_ocr.recognize_text(ocr, code_crop)
        count_text, count_score = legend_ocr.recognize_text(ocr, count_crop)
        raw_text = " ".join(part for part in [code_text, count_text] if part).strip()
        code = legend_ocr.normalize_code(code_text) or legend_ocr.normalize_code(raw_text) or f"IMG{index:02d}"
        count = legend_ocr.normalize_count(count_text)
        if count is None:
            count = legend_ocr.find_count_in_text(raw_text, code)

        prefix = f"{index:02d}"
        save_debug_crop(debug_dir / f"{prefix}_item.png", item_crop, cv2)
        save_debug_crop(debug_dir / f"{prefix}_code.png", code_crop, cv2)
        save_debug_crop(debug_dir / f"{prefix}_count.png", count_crop, cv2)

        rows.append(
            {
                "index": index,
                "box": box,
                "hex": box["hex"],
                "codeText": code_text,
                "codeScore": round(code_score, 4),
                "countText": count_text,
                "countScore": round(count_score, 4),
                "normalizedCode": code,
                "normalizedCount": count,
                "rawText": raw_text,
            }
        )

    if args.json:
        print(json.dumps({"image": str(image_path), "debugDir": str(debug_dir), "rows": rows}, ensure_ascii=False))
        return

    print(f"image: {image_path}")
    print(f"detected boxes: {len(boxes)}")
    print(f"debug crops: {debug_dir}")
    print()
    print("idx | hex     | code => normalized | count => normalized | score")
    print("----+---------+--------------------+---------------------+-------------")
    for row in rows:
        count_value = row["normalizedCount"] if row["normalizedCount"] is not None else ""
        print(
            f"{row['index']:>3} | {row['hex']:<7} | "
            f"{row['codeText'] or '-'} => {row['normalizedCode']:<6} | "
            f"{row['countText'] or '-'} => {count_value!s:<7} | "
            f"{row['codeScore']:.2f}/{row['countScore']:.2f}"
        )


if __name__ == "__main__":
    main()
