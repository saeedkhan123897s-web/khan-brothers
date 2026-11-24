'use strict';

(() => {
    const messages = new Map(`
Khan Brothers|خان برادرز|Khan Brothers
Khan Brothers | Motorcycle Business¦خان برادرز، موٹر سائیکل کاروبار¦Khan Brothers, Motorcycle Karobar
Dashboard|ڈیش بورڈ|Dashboard
Daily Report|روزانہ رپورٹ|Rozana Report
Daily comparison|روزانہ موازنہ|Rozana Muqabla
Daily comparison chart|روزانہ موازنے کا چارٹ|Rozana Muqable ka Chart
Last 7 Days|گزشتہ 7 دن|Pichle 7 Din
Last 30 Days|گزشتہ 30 دن|Pichle 30 Din
View chart data|چارٹ کے اعداد دیکھیں|Chart ka Data Dekhein
Sale|فروخت|Farokht
Expense|خرچ|Kharcha
Qist Collected|وصول شدہ قسط|Wasool Shuda Qist
Yesterday|کل|Kal
Up|اضافہ|Izafa
Down|کمی|Kami
No change|کوئی تبدیلی نہیں|Koi Tabdeeli Nahi
Yesterday was zero|کل کی رقم صفر تھی|Kal ki Raqam Sifar Thi
Bazaar Se Ye Lena Hai - Repurchase List|بازار سے خریدنے والے پرزے|Bazaar Se Ye Lena Hai
Current Stock|موجودہ اسٹاک|Maujooda Stock
Need Quantity|ضروری تعداد|Zaroori Tadaad
Le Liya|خرید لیا|Le Liya
No parts on the repurchase list.|فہرست میں خریداری کے لیے کوئی پرزہ نہیں۔|List Mein Khareedari ke Liye Koi Parza Nahi.
Day Close Karo|آج کا حساب بند کریں|Day Close Karo
Confirm Day Close|دن بند کرنے کی تصدیق کریں|Day Close Confirm Karein
Day Closed|آج کا حساب بند ہے|Aaj ka Hisaab Band Hai
Daily balances|روزانہ حساب|Rozana Hisaab
Opening Balance|ابتدائی بیلنس|Shuru ka Balance
Closing Balance|اختتامی بیلنس|Aakhri Balance
Today Qist Collected|آج وصول شدہ اقساط|Aaj Wasool Ki Gayi Qistein
Today Workshop Income|آج کی ورکشاپ آمدنی|Aaj ki Workshop Aamdani
Total Income|کل آمدنی|Kul Aamdani
Last 10 Day Closings|آخری 10 دن کا بند حساب|Aakhri 10 Din ke Closing Records
Sale income includes Qist advances. Qist collections and workshop income use recorded payments.|فروخت کی آمدنی میں قسط کی پیشگی رقم شامل ہے۔ اقساط اور ورکشاپ کی آمدنی میں درج ادائیگیاں شامل ہیں۔|Sale ki Aamdani Mein Qist ki Advance Shamil Hai. Qist aur Workshop ki Aamdani Darj Shuda Adaigiyon se Aati Hai.
Closing locks this date for new transactions.|حساب بند کرنے سے اس تاریخ پر نیا لین دین بند ہو جائے گا۔|Hisaab Band Karne se Is Tareekh par Naya Lain Dain Band Ho Jayega.
Day changed. Refresh the report before closing.|تاریخ بدل گئی ہے۔ حساب بند کرنے سے پہلے رپورٹ تازہ کریں۔|Tareekh Badal Gayi. Hisaab Band Karne se Pehle Report Refresh Karein.
This day is closed for new transactions.|اس تاریخ کا حساب بند ہے۔|Is Tareekh ka Hisaab Band Hai.
Inventory|انوینٹری|Stock ka Hisaab
Stock|اسٹاک|Stock
Purchase|خریداری|Khareed
Buy|خریدیں|Khareedein
Purchase Bike|موٹر سائیکل خریدیں|Bike Khareedein
Sell|فروخت|Farokht
Sell Bike|موٹر سائیکل بیچیں|Bike Bechein
Sold Bikes|فروخت شدہ موٹر سائیکلیں|Bikein Bik Gayi
Profit|منافع|Munafa
Profit Report|منافع کی رپورٹ|Munafe ki Report
Bike Sell Profit|موٹر سائیکل کی فروخت کا منافع|Bike ki Farokht ka Munafa
Spare Parts Profit|اسپیئر پارٹس کا منافع|Parzon ka Munafa
Handwork / Labour Profit|مزدوری کا منافع|Mazdoori ka Munafa
Total Net Profit|کل خالص منافع|Kul Khaalis Munafa
Highest Profit Source|سب سے زیادہ منافع کا ذریعہ|Sab Se Zyada Munafe ka Zariya
Salesman|سیلز مین|Salesman
Salesman / Mechanic|سیلز مین / مکینک|Salesman / Mechanic
Profit by person|ہر فرد کا منافع|Har Shakhs ka Munafa
Transactions|لین دین|Lain Dain
Item|آئٹم|Cheez
Source|ذریعہ|Zariya
Total Amount|کل رقم|Kul Raqam
Job date|کام کی تاریخ|Kaam ki Tareekh
Not recorded|درج نہیں|Darj Nahi
Save salesman|سیلز مین کا نام محفوظ کریں|Salesman ka Naam Save Karein
Back to breakdown|تفصیلات پر واپس جائیں|Tafseelat Par Wapas Jayein
No profitable source|کوئی منافع بخش ذریعہ نہیں|Kisi Zariye se Munafa Nahi
Buy Price|قیمت خرید|Khareed ki Qeemat
Bike profit includes repair and other purchase costs.|موٹر سائیکل کے منافع میں مرمت اور خریداری کے دیگر اخراجات بھی شامل ہیں۔|Bike ke Munafe mein Marammat aur Khareed ke Deegar Kharchay bhi Shamil Hain.
Profit data is unavailable.|منافع کا ڈیٹا دستیاب نہیں۔|Munafe ka Data Dastiyab Nahi.
Expenses|اخراجات|Kharchay
Customers|گاہک|Gahak
Suppliers|سپلائرز|Suppliers
Spare Parts|اسپیئر پارٹس|Parzay
Workshop|ورکشاپ|Workshop
Qist|قسط|Qist
Qist / Udhar|قسط / ادھار|Qist / Udhaar
Staff|عملہ|Amala
Settings|ترتیبات|Settings
Staff sign-in|عملے کا لاگ اِن|Amalay ka Login
Password|پاس ورڈ|Password
Sign in|لاگ اِن کریں|Login Karein
Sign out|لاگ آؤٹ کریں|Logout Karein
Language|زبان|Zubaan
Notifications|اطلاعات|Ittilaat
Notifications ({count} unread)|اطلاعات ({count} بغیر پڑھی)|Ittilaat ({count} An-Parhi)
No notifications yet.|ابھی کوئی اطلاع نہیں۔|Abhi Koi Ittila Nahi.
Could not check for new notifications.|نئی اطلاعات چیک نہیں ہو سکیں۔|Nayi Ittilaat Check Nahi Ho Sakein.
Mark as Read|پڑھا ہوا نشان لگائیں|Parha Hua Mark Karein
Qist Due Today|قسط آج واجب ہے|Qist Aaj Wajib Hai
Qist Due Tomorrow|قسط کل واجب ہے|Qist Kal Wajib Hai
Qist Overdue|قسط کی تاریخ گزر گئی|Qist ki Tareekh Guzar Gayi
Low Stock|اسٹاک کم ہے|Stock Kam Hai
Workshop Job Ready|ورکشاپ کا کام تیار ہے|Workshop ka Kaam Tayyar Hai
New Sale|نئی فروخت|Nayi Farokht
Qist Payment Received|قسط کی ادائیگی وصول ہو گئی|Qist ki Adaigi Wasool Ho Gayi
Daily Summary|روزانہ خلاصہ|Rozana Khulasa
{customer} · {bike} · {amount} due on {date}.|{customer} · {bike} · {amount} کی ادائیگی {date} کو واجب ہے۔|{customer} · {bike} ki {amount} qist {date} ko wajib hai.
{customer} · {bike} · {amount} is {days} days overdue.|{customer} · {bike} · {amount} کی ادائیگی کو {days} دن گزر چکے ہیں۔|{customer} · {bike} ki {amount} qist {days} din se baqi hai.
Bikes in stock: {quantity}.|اسٹاک میں موٹر سائیکلیں: {quantity}۔|Stock mein bikein: {quantity}.
{name} · {quantity} units in stock.|{name} · اسٹاک میں {quantity} عدد ہیں۔|{name} · stock mein {quantity} adad hain.
Job #{job} for {bike} is ready.|{bike} کا کام #{job} تیار ہے۔|{bike} ka kaam #{job} tayyar hai.
{item} sold for {amount}.|{item} کی فروخت {amount} میں ہوئی۔|{item} {amount} mein bik gaya.
{amount} collected from {customer}.|{customer} سے {amount} وصول ہوئے۔|{customer} se {amount} wasool huay.
{day} · Sale {sales} · Expense {expenses} · Cash sales {cash}.|{day} · فروخت {sales} · اخراجات {expenses} · نقد فروخت {cash}۔|{day} · Farokht {sales} · Kharcha {expenses} · Naqd farokht {cash}.
Toggle navigation|مینو کھولیں یا بند کریں|Menu Kholein ya Band Karein
Close navigation|مینو بند کریں|Menu Band Karein
Main sidebar|مرکزی سائیڈ بار|Main Sidebar
Main navigation|مرکزی مینو|Main Menu
Resize sidebar|سائیڈ بار کا سائز بدلیں|Sidebar ka Size Badlein
Refresh data|ڈیٹا تازہ کریں|Data Taaza Karein
Refreshing…|ڈیٹا تازہ ہو رہا ہے…|Data Taaza Ho Raha Hai…
Last updated: {time}|آخری بار تازہ کیا گیا: {time}|Aakhri baar update: {time}
just now|ابھی|Abhi
{count} min ago|{count} منٹ پہلے|{count} min pehle
Never refreshed|ابھی ڈیٹا تازہ نہیں ہوا|Abhi Update Nahi Hua
Data refreshed.|ڈیٹا تازہ ہو گیا۔|Data Taaza Ho Gaya.
☀ Light|☀ روشن|☀ Roshan
☾ Dark|☾ گہرا|☾ Gehra
Switch to dark theme|گہری تھیم لگائیں|Gehri Theme Lagayein
Switch to light theme|روشن تھیم لگائیں|Roshan Theme Lagayein
SPEED • POWER • PERFORMANCE|رفتار • طاقت • کارکردگی|RAFTAAR • TAQAT • KARKARDAGI
Loading Khan Brothers|خان برادرز لوڈ ہو رہا ہے|Khan Brothers Load Ho Raha Hai
Loading…|لوڈ ہو رہا ہے…|Load Ho Raha Hai…
Saving…|محفوظ ہو رہا ہے…|Save Ho Raha Hai…
Saved.|محفوظ ہو گیا۔|Save Ho Gaya.
Close|بند کریں|Band Karein
Cancel|منسوخ کریں|Mansookh Karein
Edit|ترمیم کریں|Tabdeel Karein
Save changes|تبدیلیاں محفوظ کریں|Tabdeeliyan Save Karein
Details|تفصیلات|Tafseelat
Date|تاریخ|Tareekh
Category|زمرہ|Qism
Description|تفصیل|Tafseel
Amount|رقم|Raqam
Bike|موٹر سائیکل|Bike
Bike Name|موٹر سائیکل کا نام|Bike ka Naam
Model|ماڈل|Model
Photo|تصویر|Tasveer
Bike photo|موٹر سائیکل کی تصویر|Bike ki Tasveer
Choose photo|تصویر چنیں|Tasveer Chunein
No photo chosen|کوئی تصویر منتخب نہیں|Koi Tasveer Nahi Chuni
Photo URL (optional)|تصویر کا لنک (اختیاری)|Tasveer ka Link (Ikhtiyari)
Chassis|چیسس|Chassis
Chassis No|چیسس نمبر|Chassis Number
Plate|نمبر پلیٹ|Number Plate
Plate No|پلیٹ نمبر|Plate Number
Plate number|پلیٹ نمبر|Plate Number
Customer|گاہک|Gahak
Customer name|گاہک کا نام|Gahak ka Naam
Payment|ادائیگی|Adaigi
Payment Method|ادائیگی کا طریقہ|Adaigi ka Tareeqa
Purchase Payment|خریداری کی ادائیگی|Khareed ki Adaigi
Cash|نقد|Naqd
Bank Transfer|بینک ٹرانسفر|Bank Transfer
JazzCash|جاز کیش|JazzCash
EasyPaisa|ایزی پیسہ|EasyPaisa
Card|کارڈ|Card
Sold price|فروخت کی قیمت|Farokht ki Qeemat
Total cost|کل لاگت|Kul Laagat
Real profit|حقیقی منافع|Asal Munafa
Receipt|رسید|Raseed
Status|حالت|Haalat
In stock|اسٹاک میں|Stock Mein
Sold|فروخت شدہ|Bik Gayi
Paid|ادا شدہ|Ada Ho Gaya
Pending|باقی|Baqi
Repair|مرمت|Marammat
Other|دیگر|Deegar
Sell price|فروخت کی قیمت|Farokht ki Qeemat
Expected profit|متوقع منافع|Mutawaqqa Munafa
View bike|موٹر سائیکل دیکھیں|Bike Dekhein
No matching records.|کوئی متعلقہ ریکارڈ نہیں ملا۔|Koi Milta Julta Record Nahi Mila.
Export CSV|CSV برآمد کریں|CSV Export Karein
Export Excel|ایکسل برآمد کریں|Excel Export Karein
Sales pages|فروخت کے صفحات|Farokht ke Pages
Workshop pages|ورکشاپ کے صفحات|Workshop ke Pages
Any|تمام|Sab
Search by bike, customer or chassis|موٹر سائیکل، گاہک یا چیسس سے تلاش کریں|Bike, Gahak ya Chassis se Talash Karein
Name or chassis number|نام یا چیسس نمبر|Naam ya Chassis Number
Minimum price|کم سے کم قیمت|Kam Az Kam Qeemat
Maximum price|زیادہ سے زیادہ قیمت|Zyada Se Zyada Qeemat
Reset All Filters|تمام فلٹر صاف کریں|Saare Filters Saaf Karein
Clear search|تلاش صاف کریں|Talash Saaf Karein
Clear bike|موٹر سائیکل کا فلٹر صاف کریں|Bike ka Filter Saaf Karein
Clear model|ماڈل کا فلٹر صاف کریں|Model ka Filter Saaf Karein
Clear min price|کم قیمت کا فلٹر صاف کریں|Kam Qeemat ka Filter Saaf Karein
Clear max price|زیادہ قیمت کا فلٹر صاف کریں|Zyada Qeemat ka Filter Saaf Karein
Clear status|حالت کا فلٹر صاف کریں|Haalat ka Filter Saaf Karein
Clear payment|ادائیگی کا فلٹر صاف کریں|Adaigi ka Filter Saaf Karein
Today Sale|آج کی فروخت|Aaj ki Farokht
Today Expense|آج کا خرچ|Aaj ka Kharcha
Today Profit|آج کا منافع|Aaj ka Munafa
Total Profit|کل منافع|Kul Munafa
Total Capital|کل سرمایہ|Kul Sarmaya
Qist reminders|اقساط کی یاددہانی|Qiston ki Yaaddehani
Due date|ادائیگی کی آخری تاریخ|Adaigi ki Aakhri Tareekh
Monthly Qist|ماہانہ قسط|Mahana Qist
Remaining|باقی رقم|Baqi Raqam
No payments due in the next 7 days.|اگلے 7 دن میں کوئی ادائیگی واجب نہیں۔|Agle 7 Din Mein Koi Adaigi Baqi Nahi.
View Qist|اقساط دیکھیں|Qistein Dekhein
Daily hisaab|روزانہ حساب|Rozana Hisaab
Net Profit|خالص منافع|Khaalis Munafa
Stock Bikes|اسٹاک میں موٹر سائیکلیں|Stock Mein Bikein
View Stock|اسٹاک دیکھیں|Stock Dekhein
Bike details|موٹر سائیکل کی تفصیلات|Bike ki Tafseelat
Engine condition|انجن کی حالت|Engine ki Haalat
Tyre condition|ٹائر کی حالت|Tyre ki Haalat
Body condition|باڈی کی حالت|Body ki Haalat
Purchase date|خریداری کی تاریخ|Khareed ki Tareekh
Purchase Price|قیمت خرید|Khareed ki Qeemat
Repair Cost|مرمت کی لاگت|Marammat ki Laagat
Other Cost|دیگر لاگت|Deegar Laagat
Expected Sell Price|متوقع قیمت فروخت|Mutawaqqa Farokht ki Qeemat
Save to Stock|اسٹاک میں محفوظ کریں|Stock Mein Save Karein
Sale details|فروخت کی تفصیلات|Farokht ki Tafseelat
Choose a bike|موٹر سائیکل منتخب کریں|Bike Chunein
Phone|فون|Phone Number
CNIC|شناختی کارڈ نمبر|Shanakhti Card Number
Bike Price|موٹر سائیکل کی قیمت|Bike ki Qeemat
Choose a method|طریقہ منتخب کریں|Tareeqa Chunein
Flat interest (%)|مقررہ سود (%)|Muqarrar Sood (%)
Interest|سود|Sood
Total payable|کل واجب الادا|Kul Adaigi
qists|اقساط|Qistein
Last Qist|آخری قسط|Aakhri Qist
Advance|پیشگی رقم|Peshgi Raqam
Next Date|اگلی تاریخ|Agli Tareekh
Record Sale|فروخت درج کریں|Farokht Darj Karein
Find a stock bike|اسٹاک میں موٹر سائیکل تلاش کریں|Stock Mein Bike Talash Karein
No bikes in stock|اسٹاک میں موٹر سائیکل نہیں|Stock Mein Bike Nahi
Add expense|خرچ شامل کریں|Kharcha Darj Karein
Choose a category|زمرہ منتخب کریں|Qism Chunein
Save Expense|خرچ محفوظ کریں|Kharcha Save Karein
Expense history|اخراجات کا ریکارڈ|Kharchon ka Record
Kiraya|کرایہ|Kiraya
Chai|چائے|Chai
Petrol|پیٹرول|Petrol
Mechanic|مکینک|Mechanic
Payment plans|ادائیگی کے منصوبے|Adaigi ke Plans
Total|کل|Kul
Actions|کارروائیاں|Karwaiyan
Action|کارروائی|Karwai
Record Payment|ادائیگی درج کریں|Adaigi Darj Karein
Payment history|ادائیگیوں کا ریکارڈ|Adaigi ka Record
Job Cards|جاب کارڈز|Job Cards
New Job|نیا کام|Naya Kaam
Repair History|مرمت کا ریکارڈ|Marammat ka Record
Ready|تیار|Tayyar
Bike Number|موٹر سائیکل نمبر|Bike Number
Bike Model|موٹر سائیکل ماڈل|Bike Model
Work Description|کام کی تفصیل|Kaam ki Tafseel
Parts Cost|پرزوں کی لاگت|Parzon ki Laagat
Total Bill|کل بل|Kul Bill
Save Bill|بل محفوظ کریں|Bill Save Karein
Search by Bike Number or Mobile Number|موٹر سائیکل یا موبائل نمبر سے تلاش کریں|Bike ya Mobile Number se Talash Karein
Enter a bike or mobile number|موٹر سائیکل یا موبائل نمبر درج کریں|Bike ya Mobile Number Darj Karein
Choose a valid job status.|کام کی درست حالت منتخب کریں۔|Kaam ki Durust Haalat Chunein.
The bill cannot be lower than the amount already paid.|بل ادا شدہ رقم سے کم نہیں ہو سکتا۔|Bill Ada Shuda Raqam se Kam Nahi Ho Sakta.
This payment request was already used.|ادائیگی کی یہ درخواست پہلے استعمال ہو چکی ہے۔|Adaigi ki Yeh Request Pehle Istemaal Ho Chuki Hai.
Job|کام|Kaam
Last oil change|آخری آئل تبدیلی|Aakhri Oil Tabdeeli
Next oil change|اگلی آئل تبدیلی|Agli Oil Tabdeeli
Estimate|تخمینہ|Andaza
Bike name or model|موٹر سائیکل کا نام یا ماڈل|Bike ka Naam ya Model
Mileage (km)|مائلیج (کلومیٹر)|Mileage (km)
Mileage|مائلیج|Mileage
Estimated cost|تخمینی لاگت|Andazay ki Laagat
Labour charge|مزدوری کی وصولی|Mazdoori ki Wasooli
Labour cost|مزدوری کی لاگت|Mazdoori ki Laagat
Save labour amounts|مزدوری کی رقم محفوظ کریں|Mazdoori ki Raqam Save Karein
Record labour on a completed or delivered job.|مزدوری مکمل یا حوالے کیے گئے کام پر درج کریں۔|Mazdoori Mukammal ya Hawalay Kiye Gaye Kaam par Darj Karein.
Work details|کام کی تفصیلات|Kaam ki Tafseelat
Create Job Card|جاب کارڈ بنائیں|Job Card Banayein
Workshop job #{id}|ورکشاپ کا کام #{id}|Workshop ka Kaam #{id}
Next status|اگلی حالت|Agli Haalat
Choose a status|حالت منتخب کریں|Haalat Chunein
Update status|حالت بدلیں|Haalat Badlein
Received|موصول|Mil Gayi
Diagnosing|تفتیش جاری|Jaanch Jaari
Waiting parts|پرزوں کا انتظار|Parzon ka Intezaar
In progress|کام جاری|Kaam Jaari
Completed|مکمل|Mukammal
Delivered|حوالے کر دی گئی|Hawalay Kar Di Gayi
Cancelled|منسوخ|Mansookh
Select Bike|موٹر سائیکل منتخب کریں|Bike Chunein
Balance due|باقی رقم|Baqi Raqam
Total Stock Bikes|اسٹاک میں کل موٹر سائیکلیں|Stock Mein Kul Bikein
Name|نام|Naam
Qist balance|قسط کا بقایا|Qist ki Baqi Raqam
Purchases|خریداری|Khareedari
View purchases|خریداری دیکھیں|Khareedari Dekhein
Customer records|گاہکوں کا ریکارڈ|Gahakon ka Record
Total Sale Profit|فروخت کا کل منافع|Farokht ka Kul Munafa
Total Expenses|کل اخراجات|Kul Kharchay
Sold motorcycles|فروخت شدہ موٹر سائیکلیں|Bikein Bik Gayi
Operating expenses|کاروباری اخراجات|Karobari Kharchay
Total price|کل قیمت|Kul Qeemat
Sale receipt|فروخت کی رسید|Farokht ki Raseed
Print|پرنٹ کریں|Print Karein
WhatsApp Share|واٹس ایپ پر شیئر کریں|WhatsApp par Share Karein
Record Qist Payment|قسط کی ادائیگی درج کریں|Qist ki Adaigi Darj Karein
Collect Payment|ادائیگی وصول کریں|Adaigi Wasool Karein
Fully Paid|پوری رقم ادا ہو گئی|Poori Raqam Ada Ho Gayi
Paise Lene Wale|قابل وصول رقم|Paise Lene Wale
Overdue|مدت گزر گئی|Tareekh Guzar Gayi
No outstanding dues.|کوئی رقم باقی نہیں۔|Koi Raqam Baqi Nahi.
Remaining after payment|ادائیگی کے بعد باقی رقم|Adaigi ke Baad Baqi Raqam
Payment collected.|ادائیگی وصول ہو گئی۔|Adaigi Wasool Ho Gayi.
Amount collected|وصول شدہ رقم|Wasool Shuda Raqam
Updated next date (optional)|نئی اگلی تاریخ (اختیاری)|Nayi Agli Tareekh (Ikhtiyari)
Save Payment|ادائیگی محفوظ کریں|Adaigi Save Karein
Engine|انجن|Engine
Tyres|ٹائر|Tyres
Body|باڈی|Body
Purchased|خریدی گئی|Khareedi Gayi
Add supplier|سپلائر شامل کریں|Supplier Shamil Karein
Edit supplier|سپلائر کی تفصیل بدلیں|Supplier ki Tafseel Badlein
Save supplier|سپلائر محفوظ کریں|Supplier Save Karein
Supplier records|سپلائرز کا ریکارڈ|Suppliers ka Record
Supplier name|سپلائر کا نام|Supplier ka Naam
Supplier|سپلائر|Supplier
No supplier|کوئی سپلائر نہیں|Koi Supplier Nahi
Company|کمپنی|Company
Address|پتہ|Pata
Add spare part|پرزہ شامل کریں|Parza Shamil Karein
Edit spare part|پرزے کی تفصیل بدلیں|Parzay ki Tafseel Badlein
Save spare part|پرزہ محفوظ کریں|Parza Save Karein
Sell part|پرزہ فروخت کریں|Parza Bechein
Record spare part sale|پرزے کی فروخت درج کریں|Parzay ki Farokht Darj Karein
Available stock|دستیاب اسٹاک|Dastiyab Stock
Unit sale price|فی پرزہ قیمت فروخت|Har Parzay ki Farokht ki Qeemat
Spare part not found.|اسپیئر پارٹ نہیں ملا۔|Parza Nahi Mila.
This sale request was already used.|فروخت کی یہ درخواست پہلے استعمال ہو چکی ہے۔|Farokht ki Yeh Request Pehle Istemaal Ho Chuki Hai.
Sale quantity must be within available stock.|فروخت کی تعداد دستیاب اسٹاک سے زیادہ نہیں ہو سکتی۔|Farokht ki Tadaad Dastiyab Stock se Zyada Nahi Ho Sakti.
Stock changed. Refresh the page and try again.|اسٹاک بدل گیا ہے۔ صفحہ تازہ کر کے دوبارہ کوشش کریں۔|Stock Badal Gaya. Page Refresh Karke Dobara Koshish Karein.
Part name|پرزے کا نام|Parzay ka Naam
SKU|اسٹاک کوڈ|Stock Code
Quantity|تعداد|Tadaad
Unit cost|فی پرزہ لاگت|Har Parzay ki Laagat
Parts stock|پرزوں کا اسٹاک|Parzon ka Stock
Add staff member|عملے کا رکن شامل کریں|Amalay ka Rukun Shamil Karein
Edit staff member|رکن کی تفصیل بدلیں|Rukun ki Tafseel Badlein
Save staff member|رکن محفوظ کریں|Rukun Save Karein
Staff directory|عملے کی فہرست|Amalay ki Fehrist
Staff name|عملے کے رکن کا نام|Amalay ke Rukun ka Naam
Role|عہدہ|Ohda
Choose a role|عہدہ منتخب کریں|Ohda Chunein
Manager|منیجر|Manager
Sales|فروخت|Farokht
Helper|معاون|Madadgaar
Active|فعال|Fa'al
Inactive|غیر فعال|Ghair Fa'al
Business profile|کاروبار کی تفصیلات|Karobar ki Tafseelat
Business name|کاروبار کا نام|Karobar ka Naam
Save settings|ترتیبات محفوظ کریں|Settings Save Karein
The request failed.|درخواست ناکام ہو گئی۔|Request Mukammal Nahi Hui.
Network unavailable. Try again.|نیٹ ورک دستیاب نہیں۔ دوبارہ کوشش کریں۔|Network Dastiyab Nahi. Dobara Koshish Karein.
The request could not be completed.|درخواست مکمل نہیں ہو سکی۔|Request Mukammal Nahi Ho Saki.
Connect Supabase to start saving records.|ریکارڈ محفوظ کرنے کے لیے Supabase جوڑیں۔|Record Save Karne ke Liye Supabase Jorein.
Configure a staff password to sign in.|لاگ اِن کے لیے عملے کا پاس ورڈ مقرر کریں۔|Login ke Liye Amalay ka Password Set Karein.
Invalid staff password.|عملے کا پاس ورڈ غلط ہے۔|Amalay ka Password Ghalat Hai.
Too many sign-in attempts. Try again later.|لاگ اِن کی بہت زیادہ کوششیں۔ بعد میں دوبارہ کوشش کریں۔|Login ki Bohat Zyada Koshishein. Baad Mein Dobara Koshish Karein.
Sign in to access Khan Brothers records.|ریکارڈ دیکھنے کے لیے لاگ اِن کریں۔|Record Dekhne ke Liye Login Karein.
Configure the staff password hash and session secret.|عملے کا پاس ورڈ ہیش اور سیشن سیکرٹ مقرر کریں۔|Amalay ka Password Hash aur Session Secret Set Karein.
Configure SUPABASE_URL and SUPABASE_KEY to connect the database.|ڈیٹابیس جوڑنے کے لیے SUPABASE_URL اور SUPABASE_KEY مقرر کریں۔|Database Jorne ke Liye SUPABASE_URL aur SUPABASE_KEY Set Karein.
Supabase is unavailable. Try again.|Supabase دستیاب نہیں۔ دوبارہ کوشش کریں۔|Supabase Dastiyab Nahi. Dobara Koshish Karein.
Supabase could not process the request. Check the database configuration and schema.|Supabase درخواست مکمل نہیں کر سکا۔ ڈیٹابیس کی ترتیبات اور اسکیما دیکھیں۔|Supabase Request Mukammal Nahi Kar Saka. Database Settings aur Schema Dekhein.
The database returned an unexpected response.|ڈیٹابیس سے غیر متوقع جواب آیا۔|Database se Ghair Mutawaqqa Jawab Mila.
A record with these details already exists.|ان تفصیلات کا ریکارڈ پہلے سے موجود ہے۔|In Tafseelat ka Record Pehle se Hai.
The selected related record does not exist.|منتخب متعلقہ ریکارڈ موجود نہیں۔|Chuna Gaya Mutalliq Record Mojood Nahi.
Record not found.|ریکارڈ نہیں ملا۔|Record Nahi Mila.
Choose a staff role.|عملے کا عہدہ منتخب کریں۔|Amalay ka Ohda Chunein.
Choose a staff status.|عملے کی حالت منتخب کریں۔|Amalay ki Haalat Chunein.
Enter a valid quantity.|درست تعداد درج کریں۔|Durust Tadaad Darj Karein.
Photos must be at most 2 MB.|تصویر زیادہ سے زیادہ 2 ایم بی کی ہو۔|Tasveer Zyada Se Zyada 2 MB ki Ho.
Choose a JPG, PNG or WebP photo.|JPG، PNG یا WebP تصویر منتخب کریں۔|JPG, PNG ya WebP Tasveer Chunein.
Use a valid HTTPS photo URL or upload a photo.|درست HTTPS لنک دیں یا تصویر اپ لوڈ کریں۔|Durust HTTPS Link Dein ya Tasveer Upload Karein.
Chassis number requires letters or digits.|چیسس نمبر میں حروف یا ہندسے درکار ہیں۔|Chassis Number Mein Huroof ya Hindsay Chahiyein.
Select a valid purchase payment method.|خریداری کی ادائیگی کا درست طریقہ چنیں۔|Khareed ki Adaigi ka Durust Tareeqa Chunein.
Select a payment method.|ادائیگی کا طریقہ منتخب کریں۔|Adaigi ka Tareeqa Chunein.
Enter a valid phone number.|درست فون نمبر درج کریں۔|Durust Phone Number Darj Karein.
Enter a valid 13-digit CNIC.|تیرہ ہندسوں کا درست شناختی کارڈ نمبر درج کریں۔|13 Hindson ka Durust Shanakhti Card Darj Karein.
Enter a valid date.|درست تاریخ درج کریں۔|Durust Tareekh Darj Karein.
Invalid record ID.|ریکارڈ کا شناختی نمبر غلط ہے۔|Record ka ID Ghalat Hai.
Invalid request key.|درخواست کی کلید غلط ہے۔|Request Key Ghalat Hai.
Bike not found.|موٹر سائیکل نہیں ملی۔|Bike Nahi Mili.
This bike is already sold.|یہ موٹر سائیکل پہلے فروخت ہو چکی ہے۔|Yeh Bike Pehle Bik Chuki Hai.
Enter a valid advance, monthly Qist and next payment date.|درست پیشگی رقم، ماہانہ قسط اور اگلی تاریخ درج کریں۔|Durust Peshgi Raqam, Mahana Qist aur Agli Tareekh Darj Karein.
Next payment date must be today or later.|اگلی ادائیگی کی تاریخ آج یا اس کے بعد کی ہو۔|Agli Adaigi ki Tareekh Aaj ya Uske Baad ki Ho.
Payment must be within the remaining balance.|ادائیگی باقی رقم سے زیادہ نہیں ہو سکتی۔|Adaigi Baqi Raqam se Zyada Nahi Ho Sakti.
Qist plan not found.|قسط کا منصوبہ نہیں ملا۔|Qist ka Plan Nahi Mila.
Next oil change must be after the last oil change.|اگلی آئل تبدیلی کی تاریخ آخری تاریخ کے بعد ہونی چاہیے۔|Agli Oil Tabdeeli ki Tareekh Aakhri Tareekh ke Baad Ho.
Enter a valid mileage.|درست مائلیج درج کریں۔|Durust Mileage Darj Karein.
Workshop job not found.|ورکشاپ کا کام نہیں ملا۔|Workshop ka Kaam Nahi Mila.
Invalid workshop status change.|ورکشاپ کے کام کی یہ تبدیلی درست نہیں۔|Workshop ke Kaam ki Yeh Tabdeeli Ghalat Hai.
Job status changed. Refresh and try again.|کام کی حالت بدل گئی ہے۔ تازہ کر کے دوبارہ کوشش کریں۔|Kaam ki Haalat Badal Gayi. Refresh Karke Dobara Koshish Karein.
{field} is required.|{field} درکار ہے۔|{field} Zaroori Hai.
{field} is invalid.|{field} درست نہیں۔|{field} Durust Nahi.
{field} must have up to {max} characters.|{field} میں زیادہ سے زیادہ {max} حروف ہو سکتے ہیں۔|{field} Mein Zyada Se Zyada {max} Huroof Ho Sakte Hain.
`.trim().split('\n').map(line => {
        const [english, urdu, roman] = line.split(line.includes('¦') ? '¦' : '|');
        return [english.toLowerCase(), { ur: urdu, roman }];
    }));

    const languageKey = 'kb-language';
    const controls = document.querySelectorAll('.language');
    const root = document.documentElement;
    const translatedText = new WeakMap();
    const translatedAttributes = new WeakMap();
    const textLabels = 'title, label, button, th, dt, option, h1, h2, legend, nav a, a.button, .brand span, summary, .metric span, .notice, .empty, [data-message], #breadcrumb, #receiptTitle, #workshopContent, .kb-loader-brand strong, .kb-loader-progress p';
    const attributes = ['aria-label', 'title', 'placeholder'];
    let language = 'en';
    try { language = localStorage.getItem(languageKey) || 'en'; } catch {}

    function t(key, values = {}) {
        const localized = messages.get(key.toLowerCase())?.[language] || key;
        return localized.replace(/\{(\w+)\}/g, (token, key) => values[key] ?? token);
    }

    function translateLabel(source) {
        const job = /^Workshop job #(\d+)$/.exec(source);
        if (job) return t('Workshop job #{id}', { id:job[1] });
        const fieldError = /^(.+) (is required\.|is invalid\.|must have up to (\d+) characters\.)$/.exec(source);
        if (fieldError) return t('{field} ' + fieldError[2].replace(/\d+/, '{max}'), { field:t(fieldError[1]), max:fieldError[3] });
        return t(source);
    }

    function translateText(node) {
        if (!node.parentElement?.matches(textLabels) || node.parentElement.closest('[data-verbatim]')) return;
        const current = node.nodeValue;
        if (!current.trim()) return;
        const previous = translatedText.get(node);
        const source = current === previous?.last ? previous.source : current;
        const last = source.replace(/\S(?:.*\S)?/s, value => translateLabel(value));
        translatedText.set(node, { source, last });
        if (last !== current) node.nodeValue = last;
    }

    function translateAttributes(element) {
        if (element.closest('[data-verbatim]')) return;
        const saved = translatedAttributes.get(element) || {};
        for (const attribute of attributes) {
            const current = element.getAttribute(attribute);
            if (current == null) continue;
            const previous = saved[attribute];
            const source = current === previous?.last ? previous.source : current;
            const last = t(source);
            saved[attribute] = { source, last };
            if (current !== last) element.setAttribute(attribute, last);
        }
        translatedAttributes.set(element, saved);
    }

    function localize(element) {
        if (element.nodeType === Node.TEXT_NODE) return translateText(element);
        if (element.nodeType !== Node.ELEMENT_NODE || element.closest('[data-verbatim]')) return;
        translateAttributes(element);
        element.querySelectorAll('[aria-label], [title], [placeholder]').forEach(translateAttributes);
        if (element.matches(textLabels)) element.childNodes.forEach(node => { if (node.nodeType === Node.TEXT_NODE) translateText(node); });
        element.querySelectorAll(textLabels).forEach(label => {
            label.childNodes.forEach(node => { if (node.nodeType === Node.TEXT_NODE) translateText(node); });
        });
    }

    function setLanguage(value) {
        language = ['en','ur','roman'].includes(value) ? value : 'en';
        root.lang = language === 'roman' ? 'ur-Latn' : language;
        root.dir = language === 'ur' ? 'rtl' : 'ltr';
        for (const control of controls) control.value = language;
        try { localStorage.setItem(languageKey, language); } catch {}
        localize(root);
        document.dispatchEvent(new Event('kb-language-change'));
    }

    setLanguage(language);
    controls.forEach(control => control.addEventListener('change', () => setLanguage(control.value)));
    new MutationObserver(records => {
        for (const record of records) {
            if (record.type === 'characterData') translateText(record.target);
            else if (record.type === 'attributes') translateAttributes(record.target);
            else record.addedNodes.forEach(localize);
        }
    }).observe(root, { attributes:true, attributeFilter:attributes, childList:true, characterData:true, subtree:true });

    window.kbLanguage = { t };
})();
