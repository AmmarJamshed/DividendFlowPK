#!/usr/bin/env python3
"""Send email notifications for psx.py scraper runs"""
import os
import json
import urllib.request
from datetime import datetime


def send_email(success, summary="", error=""):
    """Send email via Resend API"""
    to = os.environ.get("SCRAPER_EMAIL_TO")
    api_key = os.environ.get("RESEND_API_KEY")
    
    if not to or not api_key:
        print("[Email] Skipping - no SCRAPER_EMAIL_TO or RESEND_API_KEY")
        return
    
    date = datetime.now().strftime("%Y-%m-%d %H:%M:%S PKT")
    
    if success:
        subject = f"DividendFlow PK: PSX Prices scraped – {summary}"
        body = f"""
        <html><body style="font-family:sans-serif;padding:20px">
        <p><strong>PSX price scraper ran successfully</strong> at {date} (5pm PKT).</p>
        <p><strong>Summary:</strong> {summary}</p>
        <hr>
        <p style="color:#888;font-size:12px">DividendFlow PK – PSX Market Prices (GitHub Actions)</p>
        </body></html>
        """
    else:
        subject = f"DividendFlow PK: PSX Prices scraper failed – {error}"
        body = f"""
        <html><body style="font-family:sans-serif;padding:20px">
        <p><strong>PSX price scraper failed</strong> at {date}.</p>
        <p>Error: {error}</p>
        <hr>
        <p style="color:#888;font-size:12px">DividendFlow PK – PSX Market Prices (GitHub Actions)</p>
        </body></html>
        """
    
    try:
        payload = {
            "from": "DividendFlow <onboarding@resend.dev>",
            "to": [to],
            "subject": subject,
            "html": body,
        }
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=json.dumps(payload).encode(),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            print(f"[Email] Sent via Resend to {to}")
    except Exception as e:
        print(f"[Email] Failed to send: {e}")
