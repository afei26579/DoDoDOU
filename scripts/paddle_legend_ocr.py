#!/usr/bin/env python3
import json
import os
import re
import sys
import traceback

MAX_REASONABLE_COUNT = 999_999


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.flush()


def fail(code, message, detail=None):
    payload = {
        "ok": False,
        "code": code,
        "message": message,
    }
    if detail:
        payload["detail"] = str(detail)[:2000]
    emit(payload)


def read_payload():
    try:
        payload = json.load(sys.stdin)
    except Exception as exc:
        fail("PADDLEOCR_BAD_INPUT", "Request body must be valid JSON", exc)
        return None

    image_path = payload.get("imagePath")
    if not isinstance(image_path, str) or not image_path or not os.path.isfile(image_path):
        fail("PADDLEOCR_BAD_INPUT", "imagePath is required")
        return None

    max_items = payload.get("maxItems", 80)
    if not isinstance(max_items, int):
        max_items = 80

    return {
        "image_path": image_path,
        "max_items": max(1, min(80, max_items)),
    }


def import_dependencies():
    try:
        import cv2
        import numpy as np
        from paddleocr import PaddleOCR

        return cv2, np, PaddleOCR
    except Exception as exc:
        fail(
            "PADDLEOCR_UNAVAILABLE",
            "Python dependencies are missing. Install paddleocr and paddlepaddle for the backend OCR worker.",
            exc,
        )
        return None


def create_ocr(PaddleOCR):
    attempts = [
        {"use_angle_cls": False, "lang": "en", "show_log": False},
        {
            "lang": "en",
            "use_doc_orientation_classify": False,
            "use_doc_unwarping": False,
            "use_textline_orientation": False,
        },
        {"lang": "en"},
    ]
    last_error = None

    for kwargs in attempts:
        try:
            return PaddleOCR(**kwargs)
        except TypeError as exc:
            last_error = exc

    if last_error:
        raise last_error
    return PaddleOCR(lang="en")


def to_rgba(image, cv2):
    if image is None:
        return None
    if len(image.shape) == 2:
        return cv2.cvtColor(image, cv2.COLOR_GRAY2RGBA)
    channels = image.shape[2]
    if channels == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2RGBA)
    if channels == 4:
        return cv2.cvtColor(image, cv2.COLOR_BGRA2RGBA)
    return None


def find_runs(values, threshold, min_length, merge_gap):
    runs = []
    start = -1
    for index, value in enumerate(values):
        if value >= threshold and start < 0:
            start = index
        elif value < threshold and start >= 0:
            if index - start >= min_length:
                runs.append({"start": start, "end": index})
            start = -1

    if start >= 0 and len(values) - start >= min_length:
        runs.append({"start": start, "end": len(values)})

    merged = []
    for run in runs:
        if merged and run["start"] - merged[-1]["end"] <= merge_gap:
            merged[-1]["end"] = run["end"]
        else:
            merged.append(dict(run))
    return merged


def rgb_to_hex(pixel):
    r, g, b = [int(max(0, min(255, round(value)))) for value in pixel]
    return f"#{r:02X}{g:02X}{b:02X}"


def sample_dominant_hex(rgba, box, np):
    height, width = rgba.shape[:2]
    x0 = max(0, min(width - 1, int(round(box["x"] + box["width"] * 0.06))))
    x1 = max(x0 + 1, min(width, int(round(box["x"] + box["width"] * 0.94))))
    y0 = max(0, min(height - 1, int(round(box["y"] + box["height"] * 0.08))))
    y1 = max(y0 + 1, min(height, int(round(box["y"] + box["height"] * 0.54))))
    region = rgba[y0:y1, x0:x1]
    if region.size == 0:
        return "#D8DEE6"

    alpha_mask = region[:, :, 3] >= 24
    if not np.any(alpha_mask):
        return "#D8DEE6"

    rgb = region[:, :, :3][alpha_mask].astype(np.uint8)
    buckets = rgb >> 4
    unique, counts = np.unique(buckets, axis=0, return_counts=True)
    if unique.size == 0:
        return "#D8DEE6"

    dominant_bucket = unique[int(np.argmax(counts))]
    dominant_mask = np.all(buckets == dominant_bucket, axis=1)
    dominant_pixels = rgb[dominant_mask]
    if dominant_pixels.size == 0:
        dominant_pixels = rgb
    return rgb_to_hex(np.mean(dominant_pixels, axis=0))


def create_legend_mask(rgba, np):
    rgb = rgba[:, :, :3].astype(np.int16)
    alpha = rgba[:, :, 3]
    max_channel = np.max(rgb, axis=2)
    min_channel = np.min(rgb, axis=2)
    channel_delta = max_channel - min_channel
    luminance = rgb[:, :, 0] * 0.299 + rgb[:, :, 1] * 0.587 + rgb[:, :, 2] * 0.114

    with np.errstate(divide="ignore", invalid="ignore"):
        saturation = np.where(max_channel > 0, channel_delta / max_channel, 0)

    light_paper = (luminance > 190) & (saturation < 0.14) & (channel_delta < 44)
    return (alpha >= 24) & (~light_paper) & ((saturation > 0.08) | (luminance < 150) | (channel_delta > 52))


def detect_legend_item_boxes(rgba, max_items, np):
    crop_height, crop_width = rgba.shape[:2]
    if crop_width < 20 or crop_height < 10:
        return []

    mask = create_legend_mask(rgba, np)
    row_density = np.sum(mask, axis=1)
    row_runs = find_runs(
        row_density,
        max(3, round(crop_width * 0.035)),
        max(8, round(crop_height * 0.035)),
        max(2, round(crop_height * 0.018)),
    )
    boxes = []

    for row in row_runs:
        row_top = max(0, min(crop_height - 1, row["start"] - 2))
        row_bottom = max(row_top + 1, min(crop_height, row["end"] + 2))
        row_height = row_bottom - row_top
        col_density = np.sum(mask[row_top:row_bottom, :], axis=0)
        col_runs = find_runs(
            col_density,
            max(2, round(row_height * 0.12)),
            max(20, round(crop_width * 0.035)),
            max(3, round(crop_width * 0.012)),
        )

        for col in col_runs:
            x = max(0, min(crop_width - 1, col["start"] - 2))
            y = row_top
            width = max(1, min(crop_width - x, col["end"] - col["start"] + 4))
            height = max(1, min(crop_height - y, round(max(row_height, width * 0.42))))
            aspect = width / max(1, height)
            if width < 20 or height < 10 or aspect < 1.1 or aspect > 8.5:
                continue
            box = {
                "x": int(x),
                "y": int(y),
                "width": int(width),
                "height": int(height),
            }
            box["hex"] = sample_dominant_hex(rgba, box, np)
            boxes.append(box)

    return sorted(boxes, key=lambda item: (item["y"], item["x"]))[:max_items]


def crop_box(rgba, box, y_start_ratio, y_end_ratio):
    height, width = rgba.shape[:2]
    x0 = max(0, min(width - 1, int(round(box["x"] + box["width"] * 0.04))))
    x1 = max(x0 + 1, min(width, int(round(box["x"] + box["width"] * 0.96))))
    y0 = max(0, min(height - 1, int(round(box["y"] + box["height"] * y_start_ratio))))
    y1 = max(y0 + 1, min(height, int(round(box["y"] + box["height"] * y_end_ratio))))
    return rgba[y0:y1, x0:x1]


def average_luminance(rgb, np):
    if rgb.size == 0:
        return 255
    values = rgb.astype(np.float32)
    return float(np.mean(values[:, :, 0] * 0.299 + values[:, :, 1] * 0.587 + values[:, :, 2] * 0.114))


def prepare_text_crop(crop_rgba, cv2, np, invert_threshold=150):
    if crop_rgba.size == 0:
        return crop_rgba

    rgb = crop_rgba[:, :, :3]
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    if average_luminance(rgb, np) < invert_threshold:
        gray = 255 - gray

    height, width = gray.shape[:2]
    scale = 4 if max(width, height) < 320 else 2
    resized = cv2.resize(gray, (max(1, width * scale), max(1, height * scale)), interpolation=cv2.INTER_CUBIC)
    contrasted = cv2.convertScaleAbs(resized, alpha=1.75, beta=-72)
    blurred = cv2.GaussianBlur(contrasted, (3, 3), 0)
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)


def normalize_score(value):
    try:
        score = float(value)
    except Exception:
        return 0.6
    if score > 1:
        score = score / 100
    return max(0, min(1, score))


def collect_text_pairs(value):
    pairs = []
    seen = set()

    def add_pair(text, score=0.6):
        if isinstance(text, str) and text.strip():
            pairs.append((text.strip(), normalize_score(score)))

    def walk(obj):
        obj_id = id(obj)
        if obj_id in seen:
            return
        seen.add(obj_id)

        if obj is None:
            return
        if isinstance(obj, dict):
            if isinstance(obj.get("rec_text"), str):
                add_pair(obj.get("rec_text"), obj.get("rec_score", 0.6))
            if isinstance(obj.get("text"), str):
                add_pair(obj.get("text"), obj.get("score", 0.6))
            rec_texts = obj.get("rec_texts")
            rec_scores = obj.get("rec_scores")
            if isinstance(rec_texts, list):
                for index, text in enumerate(rec_texts):
                    score = rec_scores[index] if isinstance(rec_scores, list) and index < len(rec_scores) else 0.6
                    add_pair(text, score)
            for item in obj.values():
                walk(item)
            return
        if isinstance(obj, (list, tuple)):
            if len(obj) >= 2 and isinstance(obj[0], str) and isinstance(obj[1], (int, float)):
                add_pair(obj[0], obj[1])
                return
            if len(obj) >= 2 and isinstance(obj[1], (list, tuple)) and len(obj[1]) >= 2 and isinstance(obj[1][0], str):
                add_pair(obj[1][0], obj[1][1])
                return
            for item in obj:
                walk(item)
            return

        for attr in ("json", "to_dict", "__dict__"):
            if not hasattr(obj, attr):
                continue
            try:
                candidate = getattr(obj, attr)
                walk(candidate() if callable(candidate) else candidate)
            except Exception:
                continue

    walk(value)
    return pairs


def recognize_text(ocr, image):
    attempts = []
    if hasattr(ocr, "ocr"):
        attempts.extend([
            lambda: ocr.ocr(image, det=False, cls=False),
            lambda: ocr.ocr(image, det=False),
            lambda: ocr.ocr(image),
        ])
    if hasattr(ocr, "predict"):
        attempts.extend([
            lambda: ocr.predict(image),
            lambda: ocr.predict(input=image),
        ])

    best_text = ""
    best_score = 0.0
    for attempt in attempts:
        try:
            pairs = collect_text_pairs(attempt())
        except TypeError:
            continue
        except Exception:
            continue
        if not pairs:
            continue

        text = " ".join(pair[0] for pair in pairs).strip()
        score = sum(pair[1] for pair in pairs) / len(pairs)
        if text and score >= best_score:
            best_text = text
            best_score = score

    return best_text, best_score


def normalize_code(value):
    text = str(value or "").upper().replace("|", "I")
    compact = re.sub(r"[^A-Z0-9]", "", text)
    candidates = []
    for start in range(len(compact)):
        match = re.match(r"([A-Z]{1,3})0?(\d{1,4})", compact[start:])
        if match:
            letters = match.group(1)
            digits = str(int(match.group(2)))
            candidates.append({
                "start": start,
                "letters": letters,
                "value": f"{letters}{digits}",
            })

    if not candidates:
        return ""
    if len(candidates[0]["letters"]) <= 2:
        return candidates[0]["value"]

    preferred = [item for item in candidates if len(item["letters"]) <= 2]
    if preferred:
        return sorted(preferred, key=lambda item: (len(item["letters"]), item["start"]))[0]["value"]
    return candidates[0]["value"]


def normalize_count(value):
    text = (
        str(value or "")
        .upper()
        .replace("O", "0")
        .replace("Q", "0")
        .replace("D", "0")
        .replace("I", "1")
        .replace("L", "1")
        .replace("|", "1")
        .replace("S", "5")
        .replace("B", "8")
    )
    compact = re.sub(r"[^0-9]", "", text)
    if not compact or len(compact) > 6:
        return None
    try:
        count = int(compact)
    except Exception:
        return None
    return count if 0 <= count <= MAX_REASONABLE_COUNT else None


def find_count_in_text(value, code):
    for token in re.split(r"\s+", str(value or "")):
        token = token.strip()
        if not token:
            continue
        if normalize_code(token) == code:
            continue
        cleaned = re.sub(r"[^A-Z0-9|]", "", token, flags=re.I)
        if not re.match(r"^[0-9OQDIL|SB]+$", cleaned, flags=re.I):
            continue
        count = normalize_count(cleaned)
        if count is not None:
            return count
    return None


def recognize_entries(rgba, boxes, ocr, cv2, np):
    entries = []
    ocr_lines = []

    for index, box in enumerate(boxes):
        code_crop = prepare_text_crop(crop_box(rgba, box, 0.02, 0.58), cv2, np, invert_threshold=185)
        count_crop = prepare_text_crop(crop_box(rgba, box, 0.56, 0.98), cv2, np, invert_threshold=150)
        code_text, code_score = recognize_text(ocr, code_crop)
        count_text, count_score = recognize_text(ocr, count_crop)
        raw_text = " ".join(part for part in [code_text, count_text] if part).strip()
        code = normalize_code(code_text) or normalize_code(raw_text) or f"IMG{index + 1:02d}"
        count = normalize_count(count_text)
        if count is None:
            count = find_count_in_text(raw_text, code)
        confidence = (code_score + count_score) / 2 if count_text else code_score

        if raw_text:
            ocr_lines.append(raw_text)
        entries.append({
            "code": code,
            "hex": box["hex"],
            "count": count,
            "confidence": confidence if confidence else 0.6,
            "rawText": raw_text,
        })

    return entries, "\n".join(ocr_lines)


def main():
    payload = read_payload()
    if not payload:
        return

    dependencies = import_dependencies()
    if not dependencies:
        return
    cv2, np, PaddleOCR = dependencies

    try:
        image = cv2.imread(payload["image_path"], cv2.IMREAD_UNCHANGED)
        rgba = to_rgba(image, cv2)
        if rgba is None:
            fail("PADDLEOCR_BAD_INPUT", "Could not decode the legend image")
            return

        boxes = detect_legend_item_boxes(rgba, payload["max_items"], np)
        if not boxes:
            emit({
                "ok": True,
                "engine": "paddleocr",
                "entries": [],
                "ocrText": "",
                "warnings": ["No legend item boxes were detected."],
            })
            return

        ocr = create_ocr(PaddleOCR)
        entries, ocr_text = recognize_entries(rgba, boxes, ocr, cv2, np)
        emit({
            "ok": True,
            "engine": "paddleocr",
            "entries": entries,
            "ocrText": ocr_text,
            "warnings": [],
        })
    except Exception as exc:
        fail("PADDLEOCR_FAILED", "PaddleOCR recognition failed", traceback.format_exc() or exc)


if __name__ == "__main__":
    main()
