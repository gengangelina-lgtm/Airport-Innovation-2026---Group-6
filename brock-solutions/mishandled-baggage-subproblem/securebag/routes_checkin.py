from flask import Blueprint, request, jsonify, render_template, send_file
import base64, uuid, qrcode
from PIL import Image
from io import BytesIO
from datetime import datetime

from db import db, Bag
from bag_compare import get_dominant_colour, rgb_to_colour_name
from utils import get_local_ip
from config import PORT

checkin_bp = Blueprint("checkin", __name__)


@checkin_bp.route("/")
def index():
    return render_template("checkin.html")


@checkin_bp.route("/checkin", methods=["POST"])
def checkin():
    try:
        name        = request.form["name"]
        passport    = request.form["passport"]
        flight      = request.form["flight"]
        destination = request.form["destination"]
        gate        = request.form.get("gate", "")
        weight      = float(request.form.get("weight", 0))
        image_file  = request.files["image"]

        img = Image.open(image_file).convert("RGB")
        buf = BytesIO()
        img.save(buf, format="JPEG")
        image_b64 = base64.b64encode(buf.getvalue()).decode()

        r, g, b = get_dominant_colour(image_b64)
        colour_name = rgb_to_colour_name(r, g, b)

        barcode_id = f"{flight}-{destination[:3].upper()}-{uuid.uuid4().hex[:6].upper()}"
        db.insert({
            "barcode_id":     barcode_id,
            "passenger_name": name,
            "passport":       passport,
            "flight":         flight,
            "destination":    destination,
            "gate":           gate,
            "weight_kg":      weight,
            "descriptors":    {"colour_name": colour_name},
            "image_b64":      image_b64,
            "checked_in_at":  datetime.now().isoformat(),
            "status":         "active",
        })
        return jsonify({"barcode_id": barcode_id, "colour_name": colour_name})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@checkin_bp.route("/qr/<barcode_id>")
def qr_code(barcode_id):
    ip  = get_local_ip()
    url = f"http://{ip}:{PORT}/bag/{barcode_id}"
    img = qrcode.make(url)
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png")
