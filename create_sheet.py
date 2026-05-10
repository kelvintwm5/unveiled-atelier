#!/usr/bin/env python3
"""
Bridal Business Budget 2025 — Google Sheets creator
Creates a fully formatted Google Sheet with 4 tabs for Singapore IRAS tax filing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ONE-TIME SETUP (≈5 min)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Go to https://console.cloud.google.com
2. Create a project (or select an existing one)
3. APIs & Services → Library → search "Google Sheets API" → Enable
4. APIs & Services → Library → search "Google Drive API" → Enable
5. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
6. Application type: Desktop app → Create
7. Click the download icon → save the file as:
       credentials.json
   in the SAME folder as this script (/Users/kelvintan/unveiled-atelier/)
8. Run:  python3 create_sheet.py
   (A browser tab opens — sign in and click Allow)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import os
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]

# ── Colours (0–1 scale) ───────────────────────────────────────────────────────
def rgb(r, g, b):
    return {"red": r / 255, "green": g / 255, "blue": b / 255}

GREY_HDR   = rgb(243, 243, 243)   # #F3F3F3  header background
BLUE_ROW   = rgb(217, 232, 251)   # #D9E8FB  alternating row tint
WHITE      = rgb(255, 255, 255)
TAB_BLUE   = rgb(68,  114, 196)   # #4472C4
TAB_GREEN  = rgb(112, 173,  71)   # #70AD47
TAB_ORANGE = rgb(237, 125,  49)   # #ED7D31
TAB_GREY   = rgb(165, 165, 165)   # #A5A5A5

SGD_FMT  = {"type": "CURRENCY", "pattern": '"S$"#,##0.00'}
PCT_FMT  = {"type": "PERCENT",  "pattern": "0.00%"}

# ── Sample data ───────────────────────────────────────────────────────────────
TRANSACTIONS = [
    ["2025-01-08","Income", "Bridal gown package – Sarah Lim",   "Gown Sales",             3800,"PayNow",        "Sarah Lim",        "REC-001","Full payment"],
    ["2025-01-12","Expense","Fabric & lace materials",            "Cost of Goods",            520,"Bank Transfer", "",                 "EXP-001","For Feb stock"],
    ["2025-01-18","Income", "Gown alteration – Mrs Chan",         "Alteration Services",      280,"Cash",          "Mrs Chan",         "REC-002","Hem & bustle"],
    ["2025-01-25","Expense","Instagram ads – Jan",                "Marketing & Advertising",  150,"Bank Transfer", "",                 "EXP-002","Monthly boost"],
    ["2025-02-03","Income", "Rental deposit – Amanda Koh",        "Deposits Received",        500,"PayNow",        "Amanda Koh",       "REC-003","Deposit for Apr wedding"],
    ["2025-02-10","Income", "Veil & accessories – Priya S",       "Accessories",              320,"Cash",          "Priya Subramaniam","REC-004","Pearl veil set"],
    ["2025-02-14","Expense","Studio rental – Feb",                "Rental & Utilities",       800,"Bank Transfer", "",                 "EXP-003","Monthly studio"],
    ["2025-02-22","Expense","Alterations – external tailor",      "Alterations & Tailoring",  180,"Cash",          "",                 "EXP-004","Subcontract"],
    ["2025-03-05","Income", "Gown rental – Grace Tan",            "Gown Rental",              650,"PayNow",        "Grace Tan",        "REC-005","3-day rental"],
    ["2025-03-12","Expense","Garment bags & packaging",           "Packaging & Supplies",      95,"Cash",          "",                 "EXP-005","Bulk order"],
    ["2025-03-20","Income", "Bridal gown – Michelle Ng",          "Gown Sales",             4200,"Bank Transfer",  "Michelle Ng",     "REC-006","Includes fitting"],
    ["2025-03-28","Expense","Sewing machine service",             "Equipment & Tools",        120,"Cash",          "",                 "EXP-006","Annual service"],
    ["2025-04-05","Income", "Alteration bundle – 3 gowns",        "Alteration Services",      480,"PayNow",        "Various",          "REC-007","Walk-in clients"],
    ["2025-04-15","Expense","Accounting fees – Q1",               "Professional Services",    350,"Bank Transfer", "",                 "EXP-007","Quarterly bookkeeping"],
    ["2025-05-02","Income", "Gown sales – Rebecca Ho",            "Gown Sales",             3500,"PayNow",        "Rebecca Ho",       "REC-008","Customised A-line"],
]

EXPENSE_CATS = [
    "Cost of Goods", "Alterations & Tailoring", "Rental & Utilities",
    "Marketing & Advertising", "Professional Services", "Transport",
    "Packaging & Supplies", "Equipment & Tools", "Training & Development",
    "Bank & Payment Fees", "Miscellaneous",
]

MONTHS = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
]

# ── Cell builder helpers ──────────────────────────────────────────────────────
def _fmt(bold=False, bg=None, num_fmt=None, halign=None, italic=False, fg=None):
    f = {}
    tf = {}
    if bold:    tf["bold"] = True
    if italic:  tf["italic"] = True
    if fg:      tf["foregroundColor"] = fg
    if tf:      f["textFormat"] = tf
    if bg:      f["backgroundColor"] = bg
    if num_fmt: f["numberFormat"] = num_fmt
    if halign:  f["horizontalAlignment"] = halign
    return f

def sv(val, **kw):
    """String or number cell."""
    c = {}
    if isinstance(val, str):
        c["userEnteredValue"] = {"stringValue": val}
    elif isinstance(val, (int, float)):
        c["userEnteredValue"] = {"numberValue": val}
    f = _fmt(**kw)
    if f: c["userEnteredFormat"] = f
    return c

def fv(formula, **kw):
    """Formula cell."""
    c = {"userEnteredValue": {"formulaValue": formula}}
    f = _fmt(**kw)
    if f: c["userEnteredFormat"] = f
    return c

def ev(**kw):
    """Empty cell (formatting only)."""
    c = {}
    f = _fmt(**kw)
    if f: c["userEnteredFormat"] = f
    return c

FIELDS = (
    "userEnteredValue,"
    "userEnteredFormat.backgroundColor,"
    "userEnteredFormat.textFormat,"
    "userEnteredFormat.numberFormat,"
    "userEnteredFormat.horizontalAlignment"
)

def update_cells(sheet_id, start_row, start_col, rows):
    return {
        "updateCells": {
            "start": {"sheetId": sheet_id, "rowIndex": start_row, "columnIndex": start_col},
            "rows": [{"values": row} for row in rows],
            "fields": FIELDS,
        }
    }

def freeze(sheet_id, rows=1):
    return {
        "updateSheetProperties": {
            "properties": {"sheetId": sheet_id, "gridProperties": {"frozenRowCount": rows}},
            "fields": "gridProperties.frozenRowCount",
        }
    }

def tab_color(sheet_id, color):
    return {
        "updateSheetProperties": {
            "properties": {"sheetId": sheet_id, "tabColorStyle": {"rgbColor": color}},
            "fields": "tabColorStyle",
        }
    }

def col_width(sheet_id, col_idx, px):
    return {
        "updateDimensionProperties": {
            "range": {"sheetId": sheet_id, "dimension": "COLUMNS",
                      "startIndex": col_idx, "endIndex": col_idx + 1},
            "properties": {"pixelSize": px},
            "fields": "pixelSize",
        }
    }


# ══════════════════════════════════════════════════════════════════════════════
# TAB 1 — Transactions
# ══════════════════════════════════════════════════════════════════════════════
def tab_transactions(sid=0):
    hdr = [sv(h, bold=True, bg=GREY_HDR, halign="CENTER") for h in [
        "Date","Type","Description","Category","Amount (SGD)",
        "Payment Method","Client Name","Receipt No.","Notes",
    ]]
    rows = [hdr]
    for i, tx in enumerate(TRANSACTIONS):
        bg = BLUE_ROW if i % 2 == 0 else WHITE
        date_, type_, desc, cat, amt, pay, client, rec, note = tx
        rows.append([
            sv(date_, bg=bg), sv(type_, bg=bg), sv(desc, bg=bg), sv(cat, bg=bg),
            sv(amt,  bg=bg, num_fmt=SGD_FMT),
            sv(pay,  bg=bg), sv(client, bg=bg), sv(rec, bg=bg), sv(note, bg=bg),
        ])

    reqs = [update_cells(sid, 0, 0, rows), freeze(sid, 1), tab_color(sid, TAB_BLUE)]
    for ci, px in enumerate([95, 70, 265, 195, 110, 120, 165, 100, 180]):
        reqs.append(col_width(sid, ci, px))
    return reqs


# ══════════════════════════════════════════════════════════════════════════════
# TAB 2 — Monthly Summary
# ══════════════════════════════════════════════════════════════════════════════
def tab_monthly(sid=1):
    hdr = [sv(h, bold=True, bg=GREY_HDR, halign="CENTER") for h in [
        "Month","Total Income (SGD)","Total Expenses (SGD)","Net Profit (SGD)","Profit Margin (%)",
    ]]
    rows = [hdr]
    for i, (month, mn) in enumerate(zip(MONTHS, range(1, 13))):
        r = i + 2
        inc = (f'=SUMIFS(Transactions!$E:$E,Transactions!$B:$B,"Income",'
               f'Transactions!$A:$A,">="&DATE(2025,{mn},1),'
               f'Transactions!$A:$A,"<="&EOMONTH(DATE(2025,{mn},1),0))')
        exp = inc.replace('"Income"', '"Expense"')
        rows.append([
            sv(month),
            fv(inc, num_fmt=SGD_FMT),
            fv(exp, num_fmt=SGD_FMT),
            fv(f"=B{r}-C{r}", num_fmt=SGD_FMT),
            fv(f"=IF(B{r}=0,0,D{r}/B{r})", num_fmt=PCT_FMT),
        ])
    # Totals
    rows.append([
        sv("TOTAL", bold=True, bg=GREY_HDR),
        fv("=SUM(B2:B13)", bold=True, bg=GREY_HDR, num_fmt=SGD_FMT),
        fv("=SUM(C2:C13)", bold=True, bg=GREY_HDR, num_fmt=SGD_FMT),
        fv("=SUM(D2:D13)", bold=True, bg=GREY_HDR, num_fmt=SGD_FMT),
        fv("=IF(B14=0,0,D14/B14)", bold=True, bg=GREY_HDR, num_fmt=PCT_FMT),
    ])

    reqs = [update_cells(sid, 0, 0, rows), freeze(sid, 1), tab_color(sid, TAB_GREEN)]
    for ci, px in enumerate([110, 175, 195, 165, 155]):
        reqs.append(col_width(sid, ci, px))
    return reqs


# ══════════════════════════════════════════════════════════════════════════════
# TAB 3 — IRAS 4-Line Statement
# ══════════════════════════════════════════════════════════════════════════════
def tab_iras(sid=2):
    rev = ('=SUMIFS(Transactions!$E:$E,Transactions!$B:$B,"Income",'
           'Transactions!$A:$A,">="&DATE($B$1,1,1),'
           'Transactions!$A:$A,"<="&DATE($B$1,12,31))')
    exp = rev.replace('"Income"', '"Expense"')

    rows = [
        # Row 1 — year selector
        [sv("Year", bold=True), sv(2025, bold=True), ev(), ev(), ev()],
        # Row 2 — blank
        [ev()] * 5,
        # Row 3 — section heading
        [sv("IRAS 4-Line Statement", bold=True), ev(), ev(), ev(), ev()],
        # Row 4 — column headers
        [sv("Line", bold=True, bg=GREY_HDR, halign="CENTER"),
         sv("Description", bold=True, bg=GREY_HDR),
         sv("Amount (SGD)", bold=True, bg=GREY_HDR, halign="CENTER"),
         ev(bg=GREY_HDR), ev(bg=GREY_HDR)],
        # Row 5 — Line 1
        [sv(1), sv("Revenue (Total Receipts)"), fv(rev, num_fmt=SGD_FMT), ev(), ev()],
        # Row 6 — Line 2
        [sv(2), sv("Gross Profit/Loss  (service business — same as Revenue)"),
         fv("=C5", num_fmt=SGD_FMT), ev(), ev()],
        # Row 7 — Line 3
        [sv(3), sv("Allowable Business Expenses"), fv(exp, num_fmt=SGD_FMT), ev(), ev()],
        # Row 8 — Line 4
        [sv(4, bold=True), sv("Adjusted Profit/Loss (Net Profit)", bold=True),
         fv("=C5-C7", bold=True, num_fmt=SGD_FMT), ev(), ev()],
        # Row 9 — blank
        [ev()] * 5,
        # Row 10 — expense breakdown heading
        [sv("Expense Breakdown by Category", bold=True), ev(), ev(), ev(), ev()],
        # Row 11 — column headers
        [sv("Category", bold=True, bg=GREY_HDR),
         ev(bg=GREY_HDR),
         sv("Amount (SGD)", bold=True, bg=GREY_HDR, halign="CENTER"),
         ev(bg=GREY_HDR), ev(bg=GREY_HDR)],
    ]

    for cat in EXPENSE_CATS:
        cat_f = (f'=SUMIFS(Transactions!$E:$E,Transactions!$B:$B,"Expense",'
                 f'Transactions!$D:$D,"{cat}",'
                 f'Transactions!$A:$A,">="&DATE($B$1,1,1),'
                 f'Transactions!$A:$A,"<="&DATE($B$1,12,31))')
        rows.append([sv(cat), ev(), fv(cat_f, num_fmt=SGD_FMT), ev(), ev()])

    last_cat_row = 11 + len(EXPENSE_CATS)
    rows.append([sv("Total Expenses", bold=True), ev(),
                 fv(f"=SUM(C12:C{last_cat_row})", bold=True, num_fmt=SGD_FMT),
                 ev(), ev()])

    reqs = [update_cells(sid, 0, 0, rows), freeze(sid, 1), tab_color(sid, TAB_ORANGE)]
    for ci, px in enumerate([390, 20, 145]):
        reqs.append(col_width(sid, ci, px))
    return reqs


# ══════════════════════════════════════════════════════════════════════════════
# TAB 4 — Records Log
# ══════════════════════════════════════════════════════════════════════════════
def tab_records(sid=3):
    red = rgb(192, 0, 0)
    note_text = ("NOTE: IRAS requires all business records to be kept for "
                 "5 years from the Year of Assessment.")
    rows = [
        # Row 1 — IRAS note
        [sv(note_text, bold=True, italic=True, fg=red),
         ev(), ev(), ev(), ev()],
        # Row 2 — blank
        [ev()] * 5,
        # Row 3 — headers
        [sv(h, bold=True, bg=GREY_HDR) for h in [
            "Month","Total Transactions","Receipts Saved (Y/N)",
            "Storage Location","Notes",
        ]],
    ]
    for month, mn in zip(MONTHS, range(1, 13)):
        count_f = (f'=COUNTIFS(Transactions!$A:$A,">="&DATE(2025,{mn},1),'
                   f'Transactions!$A:$A,"<="&EOMONTH(DATE(2025,{mn},1),0))')
        rows.append([
            sv(month),
            fv(count_f),
            sv(""),
            sv("Google Drive / Physical Folder"),
            sv(""),
        ])

    reqs = [update_cells(sid, 0, 0, rows), freeze(sid, 3), tab_color(sid, TAB_GREY)]
    for ci, px in enumerate([110, 165, 175, 230, 200]):
        reqs.append(col_width(sid, ci, px))
    return reqs


# ══════════════════════════════════════════════════════════════════════════════
# Auth + main
# ══════════════════════════════════════════════════════════════════════════════
def get_service():
    creds = None
    token_path = os.path.join(os.path.dirname(__file__), "token.json")
    creds_path = os.path.join(os.path.dirname(__file__), "credentials.json")

    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(creds_path):
                raise FileNotFoundError(
                    "\n\ncredentials.json not found.\n"
                    "Follow the setup instructions at the top of this file.\n"
                )
            flow = InstalledAppFlow.from_client_secrets_file(creds_path, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(token_path, "w") as f:
            f.write(creds.to_json())
    return build("sheets", "v4", credentials=creds)


def main():
    print("Authenticating with Google...")
    svc = get_service()

    print("Creating spreadsheet...")
    body = {
        "properties": {"title": "Bridal Business Budget 2025"},
        "sheets": [
            {"properties": {"title": "Transactions",          "sheetId": 0, "index": 0}},
            {"properties": {"title": "Monthly Summary",       "sheetId": 1, "index": 1}},
            {"properties": {"title": "IRAS 4-Line Statement", "sheetId": 2, "index": 2}},
            {"properties": {"title": "Records Log",           "sheetId": 3, "index": 3}},
        ],
    }
    resp = svc.spreadsheets().create(body=body).execute()
    ss_id = resp["spreadsheetId"]

    print("Populating tabs and applying formatting...")
    requests = (
        tab_transactions(0)
        + tab_monthly(1)
        + tab_iras(2)
        + tab_records(3)
    )
    svc.spreadsheets().batchUpdate(
        spreadsheetId=ss_id, body={"requests": requests}
    ).execute()

    url = f"https://docs.google.com/spreadsheets/d/{ss_id}/edit"
    print(f"\n{'─'*60}")
    print(f"  Done!")
    print(f"  Sheet ID : {ss_id}")
    print(f"  URL      : {url}")
    print(f"{'─'*60}\n")


if __name__ == "__main__":
    main()
