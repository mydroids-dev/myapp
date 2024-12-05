const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection string
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
    coachName: String,
    seatNumber: String,
    date: String,
    name: String,
    aadhar: String,
    mobile: String,
    numberOfPassengers: Number,
    totalAmount: Number,
    advance: Number,
    remainingAmount: Number,
    discount: { type: Number, default: 0 },
    passengers: [{ name: String, aadhar: String, mobile: String, age: Number }]
});

const Booking = mongoose.model('Booking', bookingSchema);

// Define Admin schema
const adminSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
});

const Admin = mongoose.model('Admin', adminSchema);

// Middleware setup
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'your-secret',
    resave: false,
    saveUninitialized: true
}));

let bookingId = 1;

// Admin Registration Route
app.get('/admin/register', (req, res) => {
    res.render('admin-register');
});

// Handle Admin Registration
app.post('/admin/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = new Admin({ username, password: hashedPassword });

    try {
        await newAdmin.save();
        res.redirect('/admin/login');
    } catch (error) {
        console.error(error);
        res.send("Error: Username may already exist.");
    }
});

// Admin Login Routes
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
            req.session.isAdmin = true;
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
        next();
    } else {
        res.redirect('/admin/login');
    }
}

// Admin Dashboard Route
app.get('/admin', checkAdmin, async (req, res) => {
    const bookings = await Booking.find();
    const totalBookings = bookings.length;
    const today = new Date().toISOString().split('T')[0];
    const todayBookings = bookings.filter(b => b.date === today);

    const totalCollection = bookings.reduce((total, b) => total + b.totalAmount, 0);
    const totalDiscount = bookings.reduce((total, b) => total + b.discount, 0);
    const totalRemaining = bookings.reduce((total, b) => total + b.remainingAmount, 0);

    res.render('admin', {
        totalBookings,
        todayBookings: todayBookings.length,
        totalCollection,
        totalDiscount,
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
        { header: 'Coach Name', key: 'coachName' },
        { header: 'Seat Number', key: 'seatNumber' },
        { header: 'Date', key: 'date' },
        { header: 'Name', key: 'name' },
        { header: 'Aadhar', key: 'aadhar' },
        { header: 'Mobile', key: 'mobile' },
        { header: 'Passengers', key: 'numberOfPassengers' },
        { header: 'Total Amount', key: 'totalAmount' },
        { header: 'Advance Payment', key: 'advance' },
        { header: 'Remaining Amount', key: 'remainingAmount' },
        { header: 'Discount', key: 'discount' },
    ];

    bookings.forEach(booking => {
        worksheet.addRow(booking.toObject());
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=bookings.xlsx');

    await workbook.xlsx.write(res);
    res.end();
});

// Modify booking submission route to include passenger information
app.post('/book', async (req, res) => {
    const { fromStation, toStation, class: travelClass, coachName, seatNumber, date, name, aadhar, mobile, numberOfPassengers, advancePayment, discount, passengerName, passengerAge, passengerAadhar, passengerMobile } = req.body;

    const prices = { AC: 3500, Sleeper: 25000, General: 1500 };
    const totalAmount = prices[travelClass] * numberOfPassengers;

    const discountAmount = parseFloat(discount) || 0;
    const discountedAmount = totalAmount - discountAmount;
    const advance = parseFloat(advancePayment) || 0;
    const remainingAmount = discountedAmount - advance;

    // Create an array of passengers with their details
    const passengers = passengerName.map((name, index) => ({
        name,
        aadhar: passengerAadhar[index],  
        mobile: passengerMobile[index],  
        age: passengerAge[index]  
    }));

    const reservationDetails = {
        bookingId: `MBDB${String(bookingId++).padStart(5, '0')}`,
        fromStation,
        toStation,
        travelClass,
        coachName,
        seatNumber,
        date,
        name,
        aadhar,
        mobile,
        numberOfPassengers,
        totalAmount: discountedAmount,
        advance,
        remainingAmount,
        discount: discountAmount,
        passengers
    };

    const newBooking = new Booking(reservationDetails);
    await newBooking.save();

    // Render the confirmation page with reservation details
    res.render('confirmation', { reservationDetails });
});

// Mark as paid
app.post('/admin/pay/:id', checkAdmin, async (req, res) => {
    const booking = await Booking.findOne({ bookingId: req.params.id });
    if (booking) {
        booking.remainingAmount = 0;
        await booking.save();
        res.redirect('/admin');
    } else {
        res.send("Booking not found.");
    }
});

// Generate PDF Payment Slip
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
        doc.text(`From Station: ${booking.fromStation}`);
        doc.text(`To Station: ${booking.toStation}`);
        doc.text(`Total Amount After Discount: ₹${booking.totalAmount}`);
        doc.text(`Advance Payment: ₹${booking.advance}`);
        doc.text(`Remaining Amount: ₹${booking.remainingAmount}`);
        doc.text(`Discount Applied: ₹${booking.discount}`);
        doc.end();
    } else {
        res.send("Booking not found.");
    }
});

// Home Page Route
app.get('/', (req, res) => {
    res.render('index');
});

// Booking Page Route - Admin access only
app.get('/admin/booking', checkAdmin, (req, res) => {
    res.render('booking');
});

// Render Payment Slip for a Specific Booking ID
app.get('/slip/:id', async (req, res) => {
    const booking = await Booking.findOne({ bookingId: req.params.id });
    if (booking) {
        res.render('slip', { booking });
    } else {
        res.send("Booking not found.");
    }
});

// Admin Edit Booking - GET
app.get('/admin/edit/:id', checkAdmin, async (req, res) => {
    const booking = await Booking.findOne({ bookingId: req.params.id });
    if (booking) {
        res.render('edit-ticket', { booking });
    } else {
        res.send("Booking not found.");
    }
});

// Admin Edit Booking - POST
app.post('/admin/edit/:id', checkAdmin, async (req, res) => {
    const { fromStation, toStation, class: travelClass, coachName, seatNumber, date, name, aadhar, mobile, numberOfPassengers, totalAmount, advance, discount } = req.body;
    const remainingAmount = totalAmount - advance;

    try {
        await Booking.updateOne(
            { bookingId: req.params.id },
            {
                fromStation,
                toStation,
                travelClass,
                coachName,
                seatNumber,
                date,
                name,
                aadhar,
                mobile,
                numberOfPassengers: Number(numberOfPassengers),
                totalAmount: Number(totalAmount),
                advance: Number(advance),
                remainingAmount,
                discount: Number(discount)
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
            return res.redirect('/admin');
        }
        res.redirect('/');
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`); 
});