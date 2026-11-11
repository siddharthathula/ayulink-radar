#!/bin/bash
echo "Uploading to Gateway (ttyACM0)..."
cd /home/siddhartha/Desktop/Antigravity/hackathon/AyuLink/ElderCare/firmware/Gateway
pio run -t upload --upload-port /dev/ttyACM0

echo "Uploading to Wristband (ttyACM1)..."
cd /home/siddhartha/Desktop/Antigravity/hackathon/AyuLink/ElderCare/firmware/Wrist_Band
pio run -t upload --upload-port /dev/ttyACM1
