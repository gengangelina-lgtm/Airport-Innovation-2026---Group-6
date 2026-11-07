from flask import Blueprint, request, jsonify, render_template

from db import db, Bag

staff_bp = Blueprint("staff", __name__)


@staff_bp.route("/action/<barcode_id>", methods=["POST"])
def bag_action(barcode_id):
    action  = request.json.get("action")
    results = db.search(Bag.barcode_id == barcode_id)
    if not results:
        return jsonify({"ok": False, "error": "not found"}), 404
    bag = results[0]
    if bag["status"] == "flagged" and action not in ("resolve", "collect"):
        return jsonify({"ok": False, "error": "bag is flagged — resolve or collect only"})
    if action == "flag":
        db.update({"status": "flagged"}, Bag.barcode_id == barcode_id)
    elif action in ("resolve", "confirm"):
        db.update({"status": "active"}, Bag.barcode_id == barcode_id)
    elif action == "collect":
        db.remove(Bag.barcode_id == barcode_id)
    return jsonify({"ok": True})


@staff_bp.route("/clear", methods=["POST"])
def clear_db():
    db.truncate()
    return jsonify({"ok": True})


@staff_bp.route("/bags")
def all_bags():
    bags = db.all()
    return render_template("bags.html", bags=bags)
