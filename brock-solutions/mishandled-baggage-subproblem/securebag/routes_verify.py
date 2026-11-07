from flask import Blueprint, request, jsonify, render_template
import base64
from PIL import Image
from io import BytesIO

from db import db, Bag
from bag_compare import verify_bags

verify_bp = Blueprint("verify", __name__)


@verify_bp.route("/bag/<barcode_id>")
def verify_page(barcode_id):
    results = db.search(Bag.barcode_id == barcode_id)
    if not results:
        return render_template("verify.html", error="Bag not found", bag=None, other_bags=[])
    bag        = results[0]
    other_bags = [b for b in db.search(Bag.passport == bag["passport"]) if b["barcode_id"] != barcode_id]
    return render_template("verify.html", bag=bag, other_bags=other_bags, error=None)


@verify_bp.route("/verify/<barcode_id>", methods=["POST"])
def verify_bag(barcode_id):
    try:
        results = db.search(Bag.barcode_id == barcode_id)
        if not results:
            return jsonify({"ok": False, "error": "bag not found"}), 404
        bag = results[0]

        image_file = request.files.get("image")
        if not image_file:
            return jsonify({"ok": False, "error": "no scan image provided"}), 400

        img = Image.open(image_file).convert("RGB")
        buf = BytesIO()
        img.save(buf, format="JPEG")
        scan_b64 = base64.b64encode(buf.getvalue()).decode()

        result = verify_bags(bag["image_b64"], scan_b64)

        if result["verdict"] == "flag":
            db.update({"status": "flagged"}, Bag.barcode_id == barcode_id)

        return jsonify({"ok": True, "scan_b64": scan_b64, **result})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
