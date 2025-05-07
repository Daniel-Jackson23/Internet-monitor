import os
import smtplib
import socket
import time
from email.message import EmailMessage
from dotenv import load_dotenv

print("STARTED SCRIPT", flush=True)  # 👈 Add this line right after imports

load_dotenv()

CHECK_HOST = "8.8.8.8"
CHECK_PORT = 53
EMAIL_SENT_FLAG = False

def is_connected():
    try:
        socket.setdefaulttimeout(5)
        socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect((CHECK_HOST, CHECK_PORT))
        return True
    except OSError:
        return False

def send_email():
    msg = EmailMessage()
    msg.set_content("Internet connection lost on your machine")
    msg["Subject"] = "Internet Outage Alert"
    msg["From"] = os.getenv("EMAIL_FROM")
    msg["To"] = os.getenv("EMAIL_TO")
    
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(os.getenv("EMAIL_FROM"), os.getenv("EMAIL_PASS"))
        smtp.send_message(msg)

while True:
    print("Checking internet connection...", flush=True)
    if not is_connected():
        if not EMAIL_SENT_FLAG:
            print("Internet down, sending email...", flush=True)
            send_email()
            EMAIL_SENT_FLAG = True
    else:
        print("Internet is up.", flush=True)
        EMAIL_SENT_FLAG = False
    time.sleep(60)
