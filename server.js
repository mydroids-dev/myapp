const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');  
const mongoose = require('mongoose'); // Import mongoose
const bcrypt = require('bcryptjs');
const app = express();
const PORT = process.env.PORT || 3000;

// Replace this with your actual MongoDB URI
const MONGODB_URI = 'mongodb+srv://iammshyam:wne2-Vg.wj-4p2%2A@cluster0.h1a1k.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// Mongoose connection
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log(err));

// Define Booking schema
const bookingSchema = new mongoose.Schema({
    bookingId: String,
    fromStation: String,
    toStation: String,
    travelClass: String,
    date: String,
    name: String,
    aadhar: String,
    mobile: String,
    numberOfPassengers: Number,
    totalAmount: Number,
    advance: Number,
    remainingAmount: Number,
});

const Booking = mongoose.model('Booking', bookingSchema);

// Define Admin schema
const adminSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
});

const Admin = mongoose.model('Admin', adminSchema);

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'your-secret',
    resave: false,
    saveUninitialized: true
}));

let bookingId = 1;

// Admin Registration Page
app.get('/admin/register', (req, res) => {
    res.render('admin-register');
});

// Handle Admin Registration
app.post('/admin/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10); // Hashing the password
    const newAdmin = new Admin({ username, password: hashedPassword });
    try {
        await newAdmin.save(); // Save new admin to the database
        res.redirect('/admin/login'); // Redirect to login after registration
    } catch (error) {
        console.error(error);
        res.send("Error: Username may already exist.");
    }
});

// Admin Login Page
app.get('/admin/login', (req, res) => {
    res.render('admin-login');
});

// Handle Admin Login
app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (admin) {
        const match = await bcrypt.compare(password, admin.password);
        if (match) {
            req.session.isAdmin = true; // set session variable
            res.redirect('/admin');
        } else {
            res.send("Invalid Password");
        }
    } else {
        res.send("Admin not found");
    }
});

// Middleware to check admin access
function checkAdmin(req, res, next) {
    if (req.session.isAdmin) {
        next(); // User is authenticated
    } else {
        res.redirect('/admin/login'); // Redirect to login if not authenticated
    }
}

// Admin Dashboard
app.get('/admin', checkAdmin, async (req, res) => {
    const bookings = await Booking.find(); // Fetch from database
    const totalBookings = bookings.length;
    const today = new Date().toISOString().split('T')[0];
    const todayBookings = bookings.filter(b => b.date === today);
    const totalCollection = bookings.reduce((total, b) => total + b.totalAmount, 0);
    const totalRemaining = bookings.reduce((total, b) => total + b.remainingAmount, 0);

    res.render('admin', {
        totalBookings,
        todayBookings: todayBookings.length,
        totalCollection,
        totalRemaining,
        bookings
    });
});

// Download Excel with Booking Details
app.get('/admin/download-excel', checkAdmin, async (req, res) => {
    const bookings = await Booking.find();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Bookings');

    worksheet.columns = [
        { header: 'Booking ID', key: 'bookingId' },
        { header: 'From Station', key: 'fromStation' },
        { header: 'To Station', key: 'toStation' },
        { header: 'Class', key: 'travelClass' },
        { header: 'Date', key: 'date' },
        { header: 'Name', key: 'name' },
        { header: 'Aadhar', key: 'aadhar' },
        { header: 'Mobile', key: 'mobile' },
        { header: 'Passengers', key: 'numberOfPassengers' },
        { header: 'Total Amount', key: 'totalAmount' },
        { header: 'Advance Payment', key: 'advance' },
        { header: 'Remaining Amount', key: 'remainingAmount' },
    ];

    bookings.forEach(booking => {
        worksheet.addRow(booking);
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=bookings.xlsx');

    await workbook.xlsx.write(res);
    res.end();
});

// Handle booking submission (public, no protection)
app.post('/book', async (req, res) => {
    const { fromStation, toStation, class: travelClass, date, name, aadhar, mobile, numberOfPassengers, advancePayment } = req.body;
    const prices = { AC: 3000, Sleeper: 2000, General: 1500 };
    const totalAmount = prices[travelClass] * numberOfPassengers;
    const advance = parseFloat(advancePayment) || 0;
    const remainingAmount = totalAmount - advance;

    const reservationDetails = {
        bookingId: `MBDB${String(bookingId++).padStart(5, '0')}`,
        fromStation,
        toStation,
        travelClass,
        date,
        name,
        aadhar,
        mobile,
        numberOfPassengers,
        totalAmount,
        advance,
        remainingAmount,
    };

    const newBooking = new Booking(reservationDetails);
    await newBooking.save(); // Save to MongoDB

    res.render('confirmation', { reservationDetails });
});

// Mark as paid
app.post('/admin/pay/:id', checkAdmin, async (req, res) => {
    const booking = await Booking.findOne({ bookingId: req.params.id });
    if (booking) {
        booking.remainingAmount = 0; // Mark as paid
        await booking.save(); // Save updated booking to MongoDB
        res.redirect('/admin');
    } else {
        res.send("Booking not found.");
    }
});

// Generate payment slip as PDF
app.get('/payment-slip/:id', checkAdmin, async (req, res) => {
    const booking = await Booking.findOne({ bookingId: req.params.id });
    if (booking) {
        const doc = new PDFDocument();
        let filename = `payment-slip-${booking.bookingId}.pdf`;
        res.setHeader('Content-disposition', 'attachment; filename="' + filename + '"');
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        doc.fontSize(16).text('Payment Slip', { underline: true });
        doc.text(`Booking ID: ${booking.bookingId}`);
        doc.text(`Name: ${booking.name}`);
        doc.text(`Total Amount: ₹${booking.totalAmount}`);
        doc.text(`Advance Payment: ₹${booking.advance}`);
        doc.text(`Remaining Amount: ₹${booking.remainingAmount}`);

        doc.end();
    } else {
        res.send("Booking not found.");
    }
});

// Home Page
app.get('/', (req, res) => {
    res.render('index'); // Public access
});

// Booking Page
app.get('/admin/booking', checkAdmin, (req, res) => {
    res.render('booking');
});

// Render payment slip for a specific booking ID
app.get('/slip/:id', async (req, res) => {
    const booking = await Booking.findOne({ bookingId: req.params.id });
    if (booking) {
        res.render('slip', { booking });
    } else {
        res.send("Booking not found.");
    }
});

// Edit Booking - GET
app.get('/admin/edit/:id', checkAdmin, async (req, res) => {
    const booking = await Booking.findOne({ bookingId: req.params.id });
    if (booking) {
        res.render('edit-ticket', { booking });
    } else {
        res.send("Booking not found.");
    }
});

// Edit Booking - POST
app.post('/admin/edit/:id', checkAdmin, async (req, res) => {
    const { fromStation, toStation, class: travelClass, date, name, aadhar, mobile, numberOfPassengers, totalAmount, advance } = req.body;
    const remainingAmount = totalAmount - advance;

    try {
        await Booking.updateOne(
            { bookingId: req.params.id },
            {
                fromStation,
                toStation,
                travelClass,
                date,
                name,
                aadhar,
                mobile,
                numberOfPassengers: Number(numberOfPassengers),
                totalAmount: Number(totalAmount),
                advance: Number(advance),
                remainingAmount,
            }
        );
        res.redirect('/admin');
    } catch (error) {
        console.error(error);
        res.send("Error updating booking.");
    }
});

// Handle Logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/admin'); // Redirect back to admin if there was an error
        }
        res.redirect('/'); // Redirect to home after logout
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});