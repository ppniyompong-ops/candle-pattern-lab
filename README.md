# Candle Pattern Lab

เว็บ dashboard แบบ standalone สำหรับวาดแพตเทิร์นแท่งเทียน แล้วให้ Gemini ช่วยแปลง OHLC เป็น JavaScript logic สำหรับตรวจจับรูปแบบ

## เปิดใช้งานในเครื่อง

1. ติดตั้ง Node.js 18 ขึ้นไป
2. รัน **npm install**
3. คัดลอก **.env.example** เป็น **.env** แล้วใส่ Gemini API key
4. รัน **npm start** แล้วเปิด http://localhost:3000

เครื่องมือวาด, ช่องแก้ OHLC, undo/redo และคลังแพตเทิร์นทำงานในเบราว์เซอร์ การสร้าง logic ด้วย AI ใช้ **GEMINI_API_KEY** ที่ฝั่ง server เท่านั้น โดยไม่ส่ง key ไปยังหน้าเว็บ เปลี่ยนโมเดลได้ด้วย **GEMINI_MODEL**

## Deploy

Deploy เป็น Node web service โดยใช้ root directory ที่ repository root, build command **npm install** และ start command **npm start** จากนั้นเพิ่ม **GEMINI_API_KEY** ใน Environment ของผู้ให้บริการ แอปจำกัดคำขอ AI ต่อ IP ในแต่ละนาที

## ฟังก์ชัน

- วาดแท่งขึ้นและแท่งลงได้สูงสุด 12 แท่ง
- เลือก ลบ ย้อนกลับ ทำซ้ำ และแก้ค่า OHLC โดยตรง
- ซูมด้วยล้อเมาส์หรือปุ่ม +/− และลากกราฟในโหมดเลือกเพื่อเลื่อนดูส่วนต่าง ๆ
- ใช้ปุ่ม “พอดี” เพื่อจัดแท่งทั้งหมดให้อยู่ในมุมมอง
- บันทึกและโหลดแพตเทิร์นจาก local storage ของเบราว์เซอร์
- ให้ Gemini สร้าง JavaScript function **detectPattern(candles)**
- คัดลอกหรือดาวน์โหลดโค้ดที่ได้

โค้ดที่สร้างเป็นจุดเริ่มต้นสำหรับการศึกษา ควรตรวจสอบและทดสอบย้อนหลังด้วยตนเอง เว็บนี้ไม่แสดงสัญญาณซื้อขายและไม่ใช่คำแนะนำการลงทุน
