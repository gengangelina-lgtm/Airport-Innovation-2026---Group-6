from flask import Flask

from utils import get_local_ip
from config import PORT
from routes_checkin import checkin_bp
from routes_verify import verify_bp
from routes_staff import staff_bp

app = Flask(__name__)

app.register_blueprint(checkin_bp)
app.register_blueprint(verify_bp)
app.register_blueprint(staff_bp)


if __name__ == "__main__":
    ip = get_local_ip()
    print(f"\n✓ SecureBag running!")
    print(f"  Local:   http://localhost:{PORT}")
    print(f"  Network: http://{ip}:{PORT}  ← open this on your phone\n")
    app.run(host="0.0.0.0", debug=True, port=PORT)
