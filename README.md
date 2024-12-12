This Train Ticket Booking System is a Node.js application that allows users to book train tickets, view booking details, and generate reports. 

### Technologies Used
- Express.js
- MongoDB for database
- Mongoose for MongoDB object modeling
- bcrypt.js for password hashing
- PDFKit for generating PDF documents
- ExcelJS for generating Excel spreadsheets

### Features
1. User can book train tickets by providing necessary details such as from station, to station, travel class, etc.
2. Admin can register and login to access the admin dashboard.
3. Admin can view total bookings, daily bookings, total collection, total discount, and more on the dashboard.
4. Admin can mark payments as paid and generate payment slips in PDF format.
5. Admin can download booking details in Excel format.
6. Admin can edit booking details if needed.

### Installation
1. Clone the repository.
2. Install dependencies using `npm install`.
3. Set up MongoDB connection string in the `MONGODB_URI` variable in the code.
4. Start the server using `npm start`.
5. Access the application on http://localhost:3000.

### Routes
1. User booking form: /book (POST)
2. Admin login: /admin/login (POST)
3. Admin dashboard: /admin (GET)
4. Download Excel report: /admin/download-excel (GET)
5. Generate PDF payment slip: /payment-slip/:id (GET)

For detailed information on the routes and functionality, please refer to the code comments.

### Author
This Train Ticket Booking System is developed by Shyam Chaturvedi.

For any queries or support, please contact sankalpnest@gmail.com.

Thank you for using the Train Ticket Booking System! 🚆🎫
