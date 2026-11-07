# ============================================================
# BACKEND COMPONENT — DO NOT MODIFY
#
# This file implements the computer-vision comparison pipeline
# for SecureBag. It is provided as a working black box: call
# verify_bags() with two images and use the returned verdict
# ('pass', 'review', or 'flag').
#
# You are not expected to edit or experiment with this file.
# Treat it as backend infrastructure — focus your work on
# app.py, the templates, or other parts of the application.
# ============================================================

# ------------------------------------------------------------
# GLOSSARY
#
# ORB (Oriented FAST and Rotated BRIEF)
#   A fast, license-free algorithm for finding and describing distinctive
#   "keypoints" in an image (corners, edges, textured spots). FAST finds the
#   keypoints; BRIEF describes each one as a compact binary code so two
#   keypoints from different photos can be compared quickly. Used here to
#   match visual details — logos, scuffs, hardware, corners — between the
#   check-in photo and the scan photo.
#
# RANSAC (Random Sample Consensus)
#   A method for fitting a model (here, a geometric transform between two
#   photos) while ignoring outliers. It repeatedly picks a small random
#   subset of matched points, fits a transform to just those, and checks how
#   many of the *other* matches agree with it. The transform with the most
#   agreement wins, and its supporters are the "inliers" — matches that are
#   geometrically consistent with each other, as opposed to matches that
#   only looked similar by coincidence.
#
# COCO (Common Objects in Context)
#   A large, publicly available image dataset with 80 labeled everyday
#   object categories (including suitcase, handbag, backpack). "Pretrained
#   on COCO" means the bag-detector model below already knows how to spot
#   those 80 object types out of the box — no extra training was needed for
#   this project.
#
# Faster R-CNN (Region-based Convolutional Neural Network)
#   A two-stage object-detection neural network: it first proposes regions
#   of an image likely to contain an object, then classifies what's in each
#   region. The pretrained COCO detector used here is a lightweight
#   ("MobileNetV3") version of this architecture, used only to locate the
#   bag in the frame — not to identify anything about it.
#
# FFT (Fast Fourier Transform)
#   An algorithm that converts an image patch from pixel space into
#   frequency/orientation space. A repeating surface pattern (ribbing,
#   weave, faceting) shows up as energy concentrated at a specific
#   orientation, which is what the surface-texture check compares between
#   the two photos.
# ------------------------------------------------------------

import base64
from typing import Optional, TypedDict

import cv2
import numpy as np
import torch
from torchvision.models.detection import (
    FasterRCNN_MobileNet_V3_Large_320_FPN_Weights,
    fasterrcnn_mobilenet_v3_large_320_fpn,
)

# Scoring weights
# Color has consistently been the more reliable discriminator across real test
# photos — ORB is noisy both for low-texture surfaces and for repetitive
# prints/big viewpoint changes, in ways that don't reliably separate "same
# item, hard photo" from "different item". See ORB_CONFIDENCE_RATIO below for
# how ORB's veto power is gated instead of just leaning on its raw weight.
ORB_WEIGHT = 0.4
COLOR_WEIGHT = 0.6

# Verdict thresholds (combined score)
PASS_THRESHOLD = 0.35
FLAG_THRESHOLD = 0.15

# ORB tuning
LOWE_RATIO = 0.75
ORB_MAX_FEATURES = 500
HOMOGRAPHY_RATIO = 0.90          # looser ratio used to gather RANSAC candidates
RANSAC_REPROJ_THRESHOLD = 5.0    # px reprojection error allowed for a homography inlier
MIN_POINTS_FOR_HOMOGRAPHY = 4
ORB_CONFIDENCE_RATIO = 0.35      # raw-candidate ratio needed to trust a low ORB score as a
                                 # real mismatch rather than just not enough shared texture

# HSV histogram bins (H and S only — V/brightness is ignored)
H_BINS = 50
S_BINS = 60

# Scale normalization — puts the bag at a consistent apparent size before
# scoring, regardless of how zoomed-in/out the check-in vs. scan photo was.
TEXTURE_WINDOW = 31          # box-filter window (px) for the local-texture map
FOREGROUND_PERCENTILE = 60   # keep the top (100 - this)% most textured pixels
MIN_FOREGROUND_AREA_FRAC = 0.05  # below this, treat detection as failed
BBOX_PAD_FRAC = 0.08         # padding added around the detected bag bbox
NORMALIZED_SIZE = 600        # both images are resized to this before scoring

# Bag detection (pretrained on COCO — "suitcase"/"handbag"/"backpack" are
# existing classes, so this needs no training data of our own). Used only to
# find a clean native-resolution patch for the surface-texture check below;
# _foreground_bbox (texture-based) is the fallback for items outside COCO's
# 80 classes, e.g. small pouches that don't look like a "suitcase".
BAG_DETECTOR_CLASSES = {"suitcase", "handbag", "backpack"}
BAG_DETECTOR_MIN_SCORE = 0.3

# Surface-texture check (FFT orientation spectrum) — catches bags that are
# the same colour and silhouette but a genuinely different surface pattern
# (e.g. ribbed vs. diamond-faceted hard-shell finish), which colour and ORB
# both miss: colour histograms don't see pattern, and generic surface prints
# often don't produce enough ORB correspondence either way to be conclusive.
# Runs on a native-resolution central patch (not the 600x600 pipeline image)
# because fine embossed texture gets blurred away by that resize.
TEXTURE_PATCH_FRAC = 0.35     # central fraction of the bag bbox to sample
TEXTURE_PATCH_SIZE = 256      # patch is resized to this before FFT
TEXTURE_FFT_BINS = 36         # orientation histogram bins (5° each)
TEXTURE_MISMATCH_THRESHOLD = 0.6  # below this, treat as a confident texture mismatch


class Breakdown(TypedDict):
    color_score: float
    orb_score: float
    orb_candidate_ratio: float
    texture_score: float
    color_weight: float
    orb_weight: float


class VerifyResult(TypedDict):
    verdict: str          # "pass" | "review" | "flag"
    combined_score: float
    flag_reason: Optional[str]
    breakdown: Breakdown


def _decode(image_b64: str) -> np.ndarray:
    data = base64.b64decode(image_b64)
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image — check that the base64 payload is a valid JPEG/PNG")
    return img


def _soft_ellipse_mask(h: int, w: int) -> np.ndarray:
    """
    Gaussian weight map of shape (h, w), float32, normalised to [0, 1].
    Centre pixel = 1.0; weights taper toward 0 at the edges via the outer
    product of two 1-D Gaussian kernels (one per axis).  Effectively a soft
    ellipse that down-weights background clutter without removing any pixels.
    """
    ky = cv2.getGaussianKernel(h, h / 3.0)
    kx = cv2.getGaussianKernel(w, w / 3.0)
    kernel = (ky * kx.T).astype(np.float32)
    kernel /= kernel.max()
    return kernel


def _central_mask(h: int, w: int, frac: float = 0.70) -> np.ndarray:
    """
    Binary mask (uint8, 0/255): 255 inside the central frac×frac rectangle,
    0 outside.  Used to restrict ORB keypoint detection to the bag area.
    """
    mask = np.zeros((h, w), dtype=np.uint8)
    margin_y = int(h * (1 - frac) / 2)
    margin_x = int(w * (1 - frac) / 2)
    mask[margin_y: h - margin_y, margin_x: w - margin_x] = 255
    return mask


def _foreground_bbox(img: np.ndarray) -> Optional[tuple[int, int, int, int]]:
    """
    Finds the bounding box of the most visually "busy" region of the image —
    the bag itself, which has print/texture/hardware — as opposed to smooth
    background like a wall, floor, or table. Returns (x0, y0, x1, y1), or
    None if nothing textured enough stands out (e.g. a blank frame).

    Uses local Laplacian energy (texture) rather than colour or brightness,
    since bags vary wildly in colour but a photographed background is almost
    always smoother than the bag's surface, seams, and hardware.
    """
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)

    lap = cv2.Laplacian(gray, cv2.CV_32F, ksize=3)
    energy = cv2.boxFilter(lap * lap, -1, (TEXTURE_WINDOW, TEXTURE_WINDOW))

    threshold = np.percentile(energy, FOREGROUND_PERCENTILE)
    mask = (energy > threshold).astype(np.uint8) * 255
    kernel = np.ones((TEXTURE_WINDOW, TEXTURE_WINDOW), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.dilate(mask, kernel)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    largest = max(contours, key=cv2.contourArea)
    if cv2.contourArea(largest) < MIN_FOREGROUND_AREA_FRAC * h * w:
        return None

    x, y, bw, bh = cv2.boundingRect(largest)
    pad_x, pad_y = int(bw * BBOX_PAD_FRAC), int(bh * BBOX_PAD_FRAC)
    x0, y0 = max(0, x - pad_x), max(0, y - pad_y)
    x1, y1 = min(w, x + bw + pad_x), min(h, y + bh + pad_y)
    return (x0, y0, x1, y1)


def _normalize_scale(img: np.ndarray, size: int = NORMALIZED_SIZE) -> np.ndarray:
    """
    Crops to the detected bag region (falling back to the full image if
    detection fails), then letterboxes it into a fixed size x size canvas —
    scaled to fit *preserving aspect ratio*, padded with black on the short
    side. Two photos of the same bag taken at different distances/zoom levels
    end up compared at the same apparent scale instead of one being mostly
    background.

    Stretching to size x size directly (ignoring aspect ratio) would distort
    keypoint geometry differently depending on each photo's own aspect ratio,
    which hurts ORB matching between two shots with different framing.
    """
    bbox = _foreground_bbox(img)
    crop = img[bbox[1]:bbox[3], bbox[0]:bbox[2]] if bbox else img

    h, w = crop.shape[:2]
    scale = size / max(h, w)
    new_h, new_w = max(1, round(h * scale)), max(1, round(w * scale))
    resized = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_AREA)

    canvas = np.zeros((size, size, 3), dtype=np.uint8)
    y_off, x_off = (size - new_h) // 2, (size - new_w) // 2
    canvas[y_off:y_off + new_h, x_off:x_off + new_w] = resized
    return canvas


_bag_detector = None
_bag_detector_class_ids: Optional[set[int]] = None


def _get_bag_detector():
    """Lazily loads the pretrained COCO detector once per process."""
    global _bag_detector, _bag_detector_class_ids
    if _bag_detector is None:
        weights = FasterRCNN_MobileNet_V3_Large_320_FPN_Weights.DEFAULT
        _bag_detector = fasterrcnn_mobilenet_v3_large_320_fpn(weights=weights)
        _bag_detector.eval()
        categories = weights.meta["categories"]
        _bag_detector_class_ids = {
            i for i, name in enumerate(categories) if name in BAG_DETECTOR_CLASSES
        }
    return _bag_detector, _bag_detector_class_ids


def _detect_bag_bbox(img: np.ndarray) -> Optional[tuple[int, int, int, int]]:
    """
    Runs the pretrained COCO detector and returns the highest-confidence
    suitcase/handbag/backpack box, or None if nothing scored above
    BAG_DETECTOR_MIN_SCORE. COCO's 80 classes don't cover everything (a small
    fabric pouch, say) — callers should fall back to _foreground_bbox when
    this returns None, rather than treating it as an error.
    """
    detector, class_ids = _get_bag_detector()
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    tensor = torch.from_numpy(rgb).permute(2, 0, 1).unsqueeze(0)
    with torch.no_grad():
        result = detector(tensor)[0]

    best_score, best_box = 0.0, None
    for box, label, score in zip(result["boxes"], result["labels"], result["scores"]):
        if int(label) in class_ids and score > BAG_DETECTOR_MIN_SCORE and score > best_score:
            best_score, best_box = float(score), box.tolist()
    return tuple(int(v) for v in best_box) if best_box else None


def _central_texture_patch(img: np.ndarray, size: int = TEXTURE_PATCH_SIZE) -> np.ndarray:
    """
    Extracts a native-resolution square patch from the centre of the bag,
    for the surface-texture check. Uses the pretrained bag detector first
    (most accurate), falling back to the texture-based _foreground_bbox, and
    finally the whole image, so it always returns something.

    Deliberately operates on the original decoded image rather than the
    600x600 _normalize_scale output — fine embossed texture (ribbing,
    faceting) gets blurred away by that resize, which erases exactly the
    signal this check needs.
    """
    bbox = _detect_bag_bbox(img) or _foreground_bbox(img)
    h, w = img.shape[:2]
    x0, y0, x1, y1 = bbox if bbox else (0, 0, w, h)

    bw, bh = x1 - x0, y1 - y0
    cx, cy = x0 + bw // 2, y0 + bh // 2
    half = max(int(min(bw, bh) * TEXTURE_PATCH_FRAC / 2), 40)

    patch = img[max(0, cy - half):cy + half, max(0, cx - half):cx + half]
    return cv2.resize(patch, (size, size), interpolation=cv2.INTER_AREA)


def _fft_orientation_spectrum(patch: np.ndarray, bins: int = TEXTURE_FFT_BINS) -> np.ndarray:
    """
    Whitened FFT orientation histogram of a texture patch. A periodic surface
    pattern (ribbing, faceting, weave) shows up as energy concentrated at a
    specific orientation; every natural photo also has a smooth low-frequency
    falloff that has nothing to do with pattern, so each pixel is divided by
    the average magnitude at its own radius first ("whitening") to make a
    real periodic peak stand out above that baseline instead of being
    averaged away by it.
    """
    gray = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gray -= gray.mean()
    window = np.outer(np.hanning(gray.shape[0]), np.hanning(gray.shape[1]))
    spectrum = np.fft.fftshift(np.fft.fft2(gray * window))
    magnitude = np.abs(spectrum)

    cy, cx = magnitude.shape[0] // 2, magnitude.shape[1] // 2
    yy, xx = np.mgrid[0:magnitude.shape[0], 0:magnitude.shape[1]]
    yy, xx = yy - cy, xx - cx
    radius = np.sqrt(yy ** 2 + xx ** 2).astype(np.int32)
    theta = (np.arctan2(yy, xx) * 180 / np.pi) % 180

    radial_mean = np.bincount(radius.ravel(), weights=magnitude.ravel())
    radial_mean /= np.maximum(1, np.bincount(radius.ravel()))
    whitened = magnitude / (radial_mean[radius] + 1e-6)

    band = (radius > 6) & (radius < min(cy, cx))
    hist, _ = np.histogram(theta[band], bins=bins, range=(0, 180), weights=whitened[band])
    return (hist / (hist.sum() + 1e-6)).astype(np.float32)


def _texture_score(img1: np.ndarray, img2: np.ndarray) -> float:
    """
    Compares surface-pattern orientation between two bag photos, independent
    of colour. The comparison is rotation-tolerant — checked at every
    circular shift of the orientation histogram — because a small difference
    in camera roll between check-in and scan would otherwise shift a real
    pattern's peak into a different bin and look like a mismatch even for the
    same bag.
    """
    patch1 = _central_texture_patch(img1)
    patch2 = _central_texture_patch(img2)
    hist1 = _fft_orientation_spectrum(patch1)
    hist2 = _fft_orientation_spectrum(patch2)

    best = max(
        cv2.compareHist(hist1.reshape(-1, 1), np.roll(hist2, shift).reshape(-1, 1), cv2.HISTCMP_CORREL)
        for shift in range(len(hist1))
    )
    return float(max(0.0, best))


def _weighted_hs_hist(hsv: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """Weighted 2-D H×S histogram; each pixel contributes its weight instead of 1."""
    h_ch = hsv[:, :, 0].ravel().astype(np.float32)
    s_ch = hsv[:, :, 1].ravel().astype(np.float32)
    hist, _, _ = np.histogram2d(
        h_ch, s_ch,
        bins=[H_BINS, S_BINS],
        range=[[0, 180], [0, 256]],
        weights=weights.ravel(),
    )
    return hist.astype(np.float32)


def _gray_world_balance(img: np.ndarray, weights: Optional[np.ndarray] = None) -> np.ndarray:
    """
    Scales each BGR channel so its (optionally weighted) mean matches the
    overall gray mean. Corrects illuminant/colour-temperature casts (e.g.
    warm indoor light vs cool daylight) that would otherwise shift hue even
    for identical fabric.

    `weights` should be the same centre-weighted mask used for the histogram
    (see `_soft_ellipse_mask`) — without it, a large background (a wall, a
    backpack) dominates the channel means and the correction over- or
    under-shoots instead of calibrating on the bag itself.
    """
    b, g, r = cv2.split(img.astype(np.float32))
    if weights is None:
        weights = np.ones(b.shape, dtype=np.float32)
    w_sum = weights.sum() + 1e-6

    def wmean(ch: np.ndarray) -> float:
        return float((ch * weights).sum() / w_sum)

    gray_mean = (wmean(b) + wmean(g) + wmean(r)) / 3.0
    b *= gray_mean / (wmean(b) + 1e-6)
    g *= gray_mean / (wmean(g) + 1e-6)
    r *= gray_mean / (wmean(r) + 1e-6)
    return cv2.merge([b, g, r]).clip(0, 255).astype(np.uint8)


def _color_score(img1: np.ndarray, img2: np.ndarray) -> float:
    """
    Soft-weighted 2-D HS histogram correlation.
    Centre pixels contribute their full weight; edge pixels are down-weighted
    by a Gaussian envelope so background clutter has minimal influence.
    V channel is ignored to tolerate lighting differences between check-in and scan.
    Both images are gray-world balanced first so a colour-temperature shift
    between shots doesn't masquerade as an actual colour difference.
    """
    weights1 = _soft_ellipse_mask(*img1.shape[:2])
    weights2 = _soft_ellipse_mask(*img2.shape[:2])

    img1 = _gray_world_balance(img1, weights1)
    img2 = _gray_world_balance(img2, weights2)

    hsv1 = cv2.cvtColor(img1, cv2.COLOR_BGR2HSV)
    hsv2 = cv2.cvtColor(img2, cv2.COLOR_BGR2HSV)

    h1 = _weighted_hs_hist(hsv1, weights1)
    h2 = _weighted_hs_hist(hsv2, weights2)

    cv2.normalize(h1, h1, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
    cv2.normalize(h2, h2, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)

    return float(max(0.0, cv2.compareHist(h1, h2, cv2.HISTCMP_CORREL)))


def _orb_score(img1: np.ndarray, img2: np.ndarray) -> tuple[float, float]:
    """
    ORB feature matching with Lowe's ratio test, verified geometrically.
    Keypoints are restricted to the central 70% of each image (by x and y)
    so floor, wall, and hand features near the frame edges are never extracted.

    Repetitive/self-similar prints (e.g. a repeated logo) make many otherwise
    correct matches ambiguous, so a strict Lowe ratio throws them away. To
    tolerate that, candidates are gathered with a looser ratio and then
    verified with a RANSAC homography — only matches consistent with a single
    geometric transform between the two images count as "good", which filters
    out the wrong correspondences a looser ratio alone would let through.

    Returns (score, candidate_ratio). `candidate_ratio` is the fraction of
    keypoints with *any* plausible cross-image match before geometric
    verification — it's a confidence measure, separate from the score itself.
    A low score with a low candidate_ratio means there just wasn't much
    shared texture to go on (e.g. a low-texture surface, or a big viewpoint
    change) — inconclusive, not evidence of a mismatch. A low score with a
    *high* candidate_ratio means plenty of correspondences were found and
    RANSAC rejected most of them — that's a confident, genuine mismatch.
    """
    orb = cv2.ORB_create(nfeatures=ORB_MAX_FEATURES)

    kp1, des1 = orb.detectAndCompute(img1, _central_mask(*img1.shape[:2]))
    kp2, des2 = orb.detectAndCompute(img2, _central_mask(*img2.shape[:2]))

    if des1 is None or des2 is None or len(kp1) < 2 or len(kp2) < 2:
        return 0.0, 0.0

    bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    raw_matches = bf.knnMatch(des1, des2, k=2)

    candidates = [
        m for pair in raw_matches
        if len(pair) == 2
        for m, n in [pair]
        if m.distance < HOMOGRAPHY_RATIO * n.distance
    ]

    max_possible = min(len(kp1), len(kp2))
    candidate_ratio = min(1.0, len(candidates) / max_possible)

    if len(candidates) < MIN_POINTS_FOR_HOMOGRAPHY:
        # Too few points to fit a homography — fall back to the raw ratio-test count.
        return float(min(1.0, candidate_ratio)), candidate_ratio

    src_pts = np.float32([kp1[m.queryIdx].pt for m in candidates]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp2[m.trainIdx].pt for m in candidates]).reshape(-1, 1, 2)

    _, inlier_mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, RANSAC_REPROJ_THRESHOLD)
    if inlier_mask is None:
        return 0.0, candidate_ratio

    good_count = int(inlier_mask.sum())
    return float(min(1.0, good_count / max_possible)), candidate_ratio


def verify_bags(checkin_image_b64: str, scan_image_b64: str) -> VerifyResult:
    """
    Compare a check-in bag photo against a security scan image.

    Parameters
    ----------
    checkin_image_b64 : str
        Base64-encoded image captured at check-in.
    scan_image_b64 : str
        Base64-encoded image captured at the security scanner.

    Returns
    -------
    VerifyResult
        verdict        : "pass"   — bags are consistent
                         "review" — marginal match, needs human review
                         "flag"   — bags are likely different
        combined_score : weighted score in [0, 1] (see ORB_WEIGHT / COLOR_WEIGHT)
        breakdown      : per-signal scores and weights
    """
    raw1 = _decode(checkin_image_b64)
    raw2 = _decode(scan_image_b64)
    img1 = _normalize_scale(raw1)
    img2 = _normalize_scale(raw2)

    color = _color_score(img1, img2)
    orb, orb_candidate_ratio = _orb_score(img1, img2)
    # Runs on the original images, not the 600x600 pipeline output — fine
    # surface texture is exactly what that resize blurs away.
    texture = _texture_score(raw1, raw2)

    combined = ORB_WEIGHT * orb + COLOR_WEIGHT * color

    if combined >= PASS_THRESHOLD:
        verdict = "pass"
    elif combined >= FLAG_THRESHOLD:
        verdict = "review"
    else:
        verdict = "flag"

    # A weighted sum lets one very confident signal paper over the other
    # being flatly wrong — e.g. an identically-shaped bag in the wrong colour
    # can score high enough on ORB alone to reach "pass". If either signal is
    # a strong standalone mismatch, cap the verdict at "review" so a human
    # checks it instead of the score being averaged away.
    #
    # ORB's mismatch is only trusted when there was enough raw correspondence
    # data to make a confident claim (orb_candidate_ratio). A low ORB score
    # with few raw candidates just means there wasn't much shared texture to
    # go on — a low-texture surface, or a big viewpoint change between check-in
    # and scan — not evidence the bag is different. A low ORB score after
    # finding plenty of candidates (RANSAC rejected most of them) is a real,
    # confident disagreement and should still block a "pass".
    color_mismatch = color < FLAG_THRESHOLD
    orb_mismatch = orb < FLAG_THRESHOLD and orb_candidate_ratio >= ORB_CONFIDENCE_RATIO
    # Colour and ORB can both be fooled by two bags that share a colour and
    # silhouette but have a genuinely different surface pattern (e.g. ribbed
    # vs. diamond-faceted hard-shell finish) — colour histograms don't see
    # pattern at all, and ORB often can't get a confident read either way on
    # a generic surface print. The texture check catches that case directly.
    texture_mismatch = texture < TEXTURE_MISMATCH_THRESHOLD
    if verdict == "pass" and (color_mismatch or orb_mismatch or texture_mismatch):
        verdict = "review"

    flag_reason: Optional[str] = None
    if verdict in ("review", "flag"):
        reasons = []
        if orb_mismatch:
            reasons.append("low feature match")
        if color_mismatch:
            reasons.append("colour mismatch")
        if texture_mismatch:
            reasons.append("surface texture mismatch")
        flag_reason = ", ".join(reasons) if reasons else "overall low similarity"

    return {
        "verdict": verdict,
        "combined_score": round(combined, 4),
        "flag_reason": flag_reason,
        "breakdown": {
            "color_score": round(color, 4),
            "orb_score": round(orb, 4),
            "orb_candidate_ratio": round(orb_candidate_ratio, 4),
            "texture_score": round(texture, 4),
            "color_weight": COLOR_WEIGHT,
            "orb_weight": ORB_WEIGHT,
        },
    }


def get_dominant_colour(image_b64: str, k: int = 3) -> tuple[int, int, int]:
    """
    Returns the dominant colour of the image as (R, G, B).
    Uses k-means on all pixels; returns the centroid with the largest cluster.
    """
    img = _decode(image_b64)  # BGR
    pixels = img.reshape(-1, 3).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
    _, labels, centers = cv2.kmeans(pixels, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.flatten())
    b, g, r = (int(v) for v in centers[np.argmax(counts)])
    return (r, g, b)


def rgb_to_colour_name(r: int, g: int, b: int) -> str:
    """Maps an (R, G, B) tuple to a human-readable colour name."""
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    cmax = max(rf, gf, bf)
    cmin = min(rf, gf, bf)
    delta = cmax - cmin
    lightness = (cmax + cmin) / 2

    if delta < 0.12:
        if lightness < 0.2:
            return "black"
        if lightness > 0.8:
            return "white"
        return "grey"

    saturation = delta / (1 - abs(2 * lightness - 1))
    if saturation < 0.15:
        return "dark grey" if lightness < 0.5 else "light grey"

    if cmax == rf:
        h = ((gf - bf) / delta) % 6
    elif cmax == gf:
        h = (bf - rf) / delta + 2
    else:
        h = (rf - gf) / delta + 4
    hue = (h * 60) % 360

    if hue < 20 or hue >= 345:
        return "red"
    if hue < 45:
        return "orange"
    if hue < 70:
        return "yellow"
    if hue < 155:
        return "green"
    if hue < 190:
        return "teal"
    if hue < 260:
        return "blue"
    if hue < 290:
        return "purple"
    return "pink"
