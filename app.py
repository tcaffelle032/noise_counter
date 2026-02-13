from __future__ import annotations

from flask import Flask, jsonify, render_template, request



app = Flask(__name__)

DEFAULT_LEVELS = {
    "GREEN": -10.0,
    "YELLOW": -5.0,
    "RED": -3.0,
    "MAX": 0.0,
}

levels = DEFAULT_LEVELS.copy()
state = {
    "yellow": 0,
    "red": 0,
    "max": 0,
    "last_zone": None,
}


def _validate_levels(payload: dict) -> tuple[bool, str | None, dict | None]:
    try:
        new_levels = {
            "GREEN": float(payload["GREEN"]),
            "YELLOW": float(payload["YELLOW"]),
            "RED": float(payload["RED"]),
            "MAX": float(payload["MAX"]),
        }
    except (KeyError, TypeError, ValueError):
        return False, "Provide numeric GREEN/YELLOW/RED/MAX.", None

    if not (new_levels["GREEN"] < new_levels["YELLOW"] < new_levels["RED"] <= new_levels["MAX"]):
        return False, "Order must be GREEN < YELLOW < RED ≤ MAX.", None

    return True, None, new_levels


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/levels", methods=["GET"])
def get_levels():
    return jsonify(levels)


@app.route("/api/levels", methods=["POST"])
def set_levels():
    data = request.get_json(silent=True) or {}
    ok, error, new_levels = _validate_levels(data)
    if not ok:
        return jsonify({"error": error}), 400

    levels.update(new_levels)
    return jsonify(levels)


@app.route("/api/state", methods=["GET"])
def get_state():
    return jsonify(state)


@app.route("/api/state", methods=["POST"])
def update_state():
    data = request.get_json(silent=True) or {}
    label = data.get("label")
    if label not in {"GREEN", "YELLOW", "RED", "MAX"}:
        return jsonify({"error": "Invalid label."}), 400

    if label != state["last_zone"]:
        state["last_zone"] = label
        if label == "YELLOW":
            state["yellow"] += 1
            audio("static/tindeck_1.mp3").play(block=True)
        elif label == "RED":
            state["red"] += 1
        elif label == "MAX":
            state["max"] += 1

    return jsonify(state)


@app.route("/api/reset", methods=["POST"])
def reset_state():
    state.update({"yellow": 0, "red": 0, "max": 0, "last_zone": None})
    return jsonify(state)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8008, debug=False)
