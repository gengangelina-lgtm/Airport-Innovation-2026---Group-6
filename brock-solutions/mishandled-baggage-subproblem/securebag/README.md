# SecureBag: Visual Baggage Verification
<p align="center">
  <img width="148" height="50" alt="image" src="https://github.com/user-attachments/assets/8df151a1-a5fe-46b5-afdd-82e414e62380" />
</p>

Airport baggage systems rely on baggage tags and barcodes to track luggage as it moves through the terminal. However, these identifiers are attached to a bag—they do not independently verify that the physical bag later entering the baggage system is the same one originally presented at check-in. If a bag is accidentally switched or deliberately substituted, such as in an attempt to introduce contraband, the tag alone may not reveal the change.

SecureBag explores visual re-identification as an additional verification step. At check-in, staff photograph each bag and generate a Quick Response (QR) code linked to its baggage record. When the bag is photographed again at a later checkpoint, the system compares the new image with the original and returns pass, review, or flag. This provides staff with an additional operational signal to help confirm that the same physical bag has continued through the baggage-handling process.

https://github.com/user-attachments/assets/377e4fff-01ec-411c-b1f3-7e2aa4cb946f
<p><sub><em>Baggage Comparasion Flow</em></sub></p>

The current challenge is to transform this prototype into a practical, reliable, and understandable airport workflow. Improvements could reduce bag-handling errors, help staff investigate potential mismatches or substitutions, and provide clearer evidence of where and when a bag was processed. Because factors such as lighting, camera angle, background, and similar-looking luggage can affect image matching, visual re-identification should remain decision support rather than proof of identity.

![Screenshot of the SecureBag app 'All Bags' dashboard showing 6 active bags in a table with columns for Photo, Passenger, Flight, Colour, Weight, and Status. Two bags are flagged (red 'Flagged' status with a 'Resolve flag' button): a grey bag for passenger 'safgew' on flight brfdgrs at 24.5kg, and a grey bag labeled 'Carrie On' on flight AC871 at 23.1kg. The remaining four bags show a green 'Active' status. Each row has a 'Verify' link, and the page header includes 'Refresh' and 'Check in' buttons.](image-1.png)
 
Brock Solutions designs and integrates large-scale automation systems for aviation, transit, and industrial environments. Relevant stakeholders include airport operators, baggage-handling staff, airlines, security personnel, and passengers. For this Innovation Challenge, teams should consider how a prototype could be integrated into operations at Toronto Pearson International Airport (YYZ).

## Table of Contents

- [Challenge](#challenge)
- [Potential Solutions](#potential-solutions)
- [Resources](#resources)
  - [Background Information](#background-information)
  - [Technical Resources](#technical-resources)
  - [Starter Workflow](#starter-workflow)
  - [Comparison pipeline](#comparison-pipeline)
  - [Application Programming Interface Routes](#application-programming-interface-routes)
  - [Run the Starter Application](#run-the-starter-application)
  - [Data Sources](#data-sources)
  - [Additional References](#additional-references)
  - [Abbreviation Reference](#abbreviation-reference)
  - [Important Prototype Limitations](#important-prototype-limitations)

## Challenge

Your goal is to extend SecureBag with a meaningful feature that improves baggage verification, tracking, staff decision-making, safety, or reliability.

The starter application already provides:

- Bag check-in with passenger, flight, destination, gate, weight, and image fields
- A unique bag identifier and QR code
- A verification page for uploading a second image
- A `pass`, `review`, or `flag` result
- A staff dashboard and basic bag-status actions
- Sample bag images for testing

The computer-vision system is primarily a **backend component**. The Flask application handles the web workflow, templates, data storage, and staff actions, then calls `verify_bags()` in `bag_compare.py` when it needs an image comparison. Most teams can treat `bag_compare.py` as a black box: provide two images and use the returned verdict. Teams interested in computer vision may instead evaluate or improve that backend.

Successful solutions should consider:

- A clear airport operational problem and a specific user
- Human review for uncertain or safety-relevant decisions
- Input validation, failure handling, and understandable feedback
- Privacy-conscious handling of passenger information and bag images
- Performance under different lighting, cameras, bags, or network conditions
- A focused scope that can be demonstrated reliably

Teams are encouraged to explore solutions such as:

- Software applications and staff dashboards
- Hardware-assisted weight, camera, barcode, or sensor prototypes
- Data-analysis and model-evaluation tools
- Workflow optimization and anomaly detection
- Privacy, reliability, and security improvements
- Research-based or hybrid solutions

Solutions should consider:

- Feasibility
- Scalability
- User impact
- Sustainability
- Technical implementation

## Potential Solutions

The ideas below are examples to help teams explore possible directions. They are not the only possible solutions.

Teams are encouraged to combine ideas, explore new approaches, and develop creative solutions. A narrow feature that works reliably and is explained well is stronger than several incomplete features.

| **Potential Solution** | **Description** | **Resources** |
|---|---|---|
| **Weight-based verification** | Ask for a second weight measurement, compare it with the check-in weight, and combine the result with the image verdict. Show the difference and explain why the bag passed, needs review, or was flagged. | [`app.py`](app.py), [`verify.html`](templates/verify.html) |
| **Bag journey and anomaly tracking** | Record checkpoints such as check-in, security, sorting, gate, and carousel. Display a timeline and flag missing, repeated, or out-of-order events. | [`app.py`](app.py), [`bags.html`](templates/bags.html), [`bags.json`](bags.json) |
| **Staff review dashboard** | Add filtering, a flag queue, reason codes, resolution notes, and useful operational metrics so staff can prioritize exceptions. | [`bags.html`](templates/bags.html), [`verify.html`](templates/verify.html) |
| **Safer staff workflow** | Add staff authentication, roles, confirmation for destructive actions, an audit trail, and safer handling of collected bags. | [`app.py`](app.py), [`checkin.html`](templates/checkin.html) |
| **Comparison evaluation tool** | Run labelled image pairs through the backend, report false passes and false flags, and help users explore threshold changes. | [`bag_compare.py`](bag_compare.py), [`sample_img/`](sample_img/) |
| **Mobile checkpoint experience** | Improve phone capture, accessibility, loading feedback, retry behaviour, and QR-code scanning for staff working beside a conveyor or checkpoint. | [`checkin.html`](templates/checkin.html), [`verify.html`](templates/verify.html) |

## Resources

The following resources may help teams understand the problem, run the starter application, and develop a solution.

### Background Information

- [International Air Transport Association (IATA) baggage standards](https://www.iata.org/en/programs/ops-infra/baggage/standards/) — baggage tracking and security-control context
- [IATA Baggage Reference Manual](https://www.iata.org/en/publications/manuals/baggage-reference-manual/) — industry practices and baggage-related resolutions
- [International Civil Aviation Organization (ICAO) publications](https://www.icao.int/publications) — aviation standards and guidance
- [Airports Council International](https://aci.aero/) — airport operations and industry context

### Technical Resources

| Resource | Purpose |
|---|---|
| [`app.py`](app.py) | Flask app creation and blueprint registration |
| [`routes_checkin.py`](routes_checkin.py) | Check-in routes: check-in form, bag creation, QR code |
| [`routes_verify.py`](routes_verify.py) | Verification routes: verification page, image comparison |
| [`routes_staff.py`](routes_staff.py) | Staff routes: bag actions, dashboard, clearing records |
| [`db.py`](db.py) | Shared TinyDB instance and query object |
| [`config.py`](config.py) | Shared configuration constants (e.g. `PORT`) |
| [`utils.py`](utils.py) | Shared helpers (e.g. local IP lookup for QR codes) |
| [`templates/checkin.html`](templates/checkin.html) | Bag check-in interface |
| [`templates/bags.html`](templates/bags.html) | Staff dashboard |
| [`templates/verify.html`](templates/verify.html) | Bag verification interface |
| [`bag_compare.py`](bag_compare.py) | Backend computer-vision pipeline |
| [`requirements.txt`](requirements.txt) | Required Python libraries |
| [`bags.json`](bags.json) | TinyDB runtime data containing bag records and encoded images |
| [`sample_img/`](sample_img/) | Sample bag-image pairs for manual testing |

The interface uses HyperText Markup Language (HTML), Cascading Style Sheets (CSS), and JavaScript. The backend uses Flask, Pillow, the Open Source Computer Vision Library (OpenCV), PyTorch, torchvision, NumPy, `qrcode`, and TinyDB.

### Starter Workflow

1. **Check-in:** Staff enter the passenger name, passport number, flight, destination, gate, and bag weight, then take a photo.
2. **Bag record:** The application stores the information and base64-encoded image in `bags.json`. It generates a short bag identifier such as `AC123-YYZ-8F2A3C`.
3. **QR code:** The application creates a QR code linked to that bag's verification page.
4. **Verification:** Staff scan the QR code and upload a new photo at a later checkpoint.
5. **Decision:** The backend compares the new photo with the check-in photo and returns `pass`, `review`, or `flag`.
6. **Staff action:** Staff can confirm or manually flag an active bag, resolve a flagged bag, or collect it. Collecting a bag deletes its database record.

### Comparison pipeline

`bag_compare.py` combines three visual signals:

- **Colour:** A centre-weighted hue/saturation histogram checks whether the bags have similar overall colours while reducing the effect of brightness changes.
- **Visual features:** Oriented FAST and Rotated BRIEF (ORB) keypoints look for matching details such as logos, patterns, corners, and scuffs. Random Sample Consensus (RANSAC) checks whether those matches align geometrically.
- **Surface texture:** A Fast Fourier Transform (FFT)-based orientation comparison helps distinguish similarly coloured bags with different surface patterns or materials.

For the main colour and feature comparison, each image is cropped with a texture-based foreground detector and normalized to a fixed canvas. For the surface-texture check, a model trained on the Common Objects in Context (COCO) dataset attempts to locate a `suitcase`, `handbag`, or `backpack`. That model uses a Faster Region-based Convolutional Neural Network (Faster R-CNN). If it cannot find a bag, the code falls back to the foreground detector.

Colour and ORB scores are combined and compared with `PASS_THRESHOLD` and `FLAG_THRESHOLD`. Colour has a weight of `0.6`, ORB has a weight of `0.4`, and texture acts as a mismatch veto rather than a separately weighted score. A strong mismatch in colour, ORB features, or texture can reduce an apparent pass to `review`. Tuning constants are near the top of `bag_compare.py`.

The pipeline is heuristic: lighting, camera angle, background, image quality, and bag type can all affect the result.

### Application Programming Interface Routes

The application programming interface (API) uses Hypertext Transfer Protocol (HTTP) methods. `GET` retrieves a page or resource, while `POST` submits data or changes application state.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Display the check-in form |
| `POST` | `/checkin` | Create a bag record from `name`, `passport`, `flight`, `destination`, `gate`, `weight`, and `image` |
| `GET` | `/qr/<barcode_id>` | Return a Portable Network Graphics (PNG) QR code linked to the bag's verification page |
| `GET` | `/bag/<barcode_id>` | Display the verification page for one bag |
| `POST` | `/verify/<barcode_id>` | Compare an uploaded `image` with the check-in image |
| `POST` | `/action/<barcode_id>` | Apply `flag`, `resolve`, `confirm`, or `collect` |
| `POST` | `/clear` | Delete every bag record |
| `GET` | `/bags` | Display all bag records |

Example action request using JavaScript Object Notation (JSON):

```json
{
  "action": "confirm"
}
```

### Run the Starter Application

The source uses Python 3.9 or newer. Python 3.10 or 3.11 is recommended for package compatibility.

On Windows, a short virtual-environment path helps avoid PyTorch installation errors caused by long filenames:

```powershell
python -m venv C:\venv-securebag
C:\venv-securebag\Scripts\activate
pip install -r requirements.txt
python app.py
```

On macOS or Linux:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open `http://localhost:5001` for check-in or `http://localhost:5001/bags` for the staff dashboard. The first image comparison may download pretrained model weights and can take longer than later comparisons.

### Data Sources

- [`sample_img/`](sample_img/) contains sample image pairs for manual testing.
- [`bags.json`](bags.json) is the TinyDB runtime data file. It contains encoded bag images and passenger fields, so teams must use fictional passenger information only.
- The sample images are demonstration inputs, not a complete or statistically valid evaluation dataset.

### Additional References

- [IATA Baggage Information Exchange](https://www.iata.org/en/programs/ops-infra/baggage/baggage-information-exchange-bix/) — baggage data exchange and interoperability
- [IATA Technical Peripheral Specifications](https://www.iata.org/en/publications/manuals/iata-technical-peripheral-specifications/) — context for baggage-related devices and common-use systems

### Abbreviation Reference

| Short form | Meaning |
|---|---|
| API | Application Programming Interface |
| BRIEF | Binary Robust Independent Elementary Features |
| COCO | Common Objects in Context |
| CSS | Cascading Style Sheets |
| FAST | Features from Accelerated Segment Test |
| FFT | Fast Fourier Transform |
| GET | HTTP method used to retrieve a page or resource |
| HTML | HyperText Markup Language |
| HTTP | Hypertext Transfer Protocol |
| ID | Identifier |
| IATA | International Air Transport Association |
| ICAO | International Civil Aviation Organization |
| IP | Internet Protocol |
| JSON | JavaScript Object Notation |
| LAN | Local Area Network |
| OpenCV | Open Source Computer Vision Library |
| ORB | Oriented FAST and Rotated BRIEF |
| PII | Personally Identifiable Information |
| PNG | Portable Network Graphics |
| POST | HTTP method used to submit data or change application state |
| QR | Quick Response |
| RANSAC | Random Sample Consensus |
| R-CNN | Region-based Convolutional Neural Network |
| UDP | User Datagram Protocol |
| YYZ | Airport code for Toronto Pearson International Airport |

### Important Prototype Limitations

- **No authentication or authorization:** Anyone who can reach the server can view passenger data, register bags, verify them, change their status, or clear the database.
- **Plaintext passenger information:** `bags.json` stores personally identifiable information (PII), including passenger names and passport numbers, together with full bag images without encryption. Use fictional information only.
- **Tracked runtime data:** The repository currently tracks `bags.json`. Adding, collecting, or clearing bags changes a tracked file.
- **Destructive actions:** `/clear` deletes every record without authentication or server-side confirmation. The `collect` action also deletes the selected bag instead of retaining an audit history.
- **Network-accessible debug mode:** Flask runs with `debug=True` while listening on `0.0.0.0`. This must only be used on a trusted local network and must be disabled before wider deployment.
- **Unrestricted uploads:** The application does not enforce a maximum upload size or strictly validate uploaded image formats before processing them.
- **Unpinned dependencies:** `requirements.txt` does not specify package versions, so installations may behave differently over time.
- **Network-address dependency:** `get_local_ip()` opens a User Datagram Protocol (UDP) socket to `8.8.8.8` to determine the machine's local Internet Protocol (IP) address. Startup or QR-code generation may fail on restricted or fully offline networks.
- **Prototype storage:** TinyDB is convenient for a demonstration but is not intended for encrypted sensitive data or a concurrent production workload.
- **Heuristic comparison:** A `pass` is not proof that two images show the same physical bag. The comparison was developed against a small set of sample images and may require different thresholds for other lighting, cameras, backgrounds, or bag types.
- **No formal validation dataset:** The supplied image pairs are demonstration inputs, not a statistically meaningful accuracy benchmark.
- **Not a security system:** The prototype must not replace approved baggage-screening procedures, certified systems, or trained staff.

Do not enter real passport information or expose this prototype to the public internet.
