const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection string
const MONGODB_URI = 'mongodb+srv://iammshyam:wne2-Vg.wj-4p2%2A@cluster0.h1a1k.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// Mongoose connection
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error(err));

// Define Booking schema
const bookingSchema = new mongoose.Schema({
    bookingId: String,
    fromStation: String,
    toStation: String,
    travelClass: String,
    coachName: String,
    seatNumber: [String],
    date: { type: Date, default: Date.now },
    bookedBy: String,
    aadhar: String,
    mobile: String,
    numberOfPassengers: Number,
    totalAmount: Number,
    advance: Number,
    remainingAmount: Number,
    discount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
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

let bookingIdCounter = 1; // Variable to generate booking IDs

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Directory for uploads
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // File naming
    }
});

const upload = multer({ storage });

// Routes
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

// View Booking Page
app.get('/view', (req, res) => {
    res.render('view', { booking: null, error: null });
});

// Check Booking
app.post('/check-booking', async (req, res) => {
    const { bookingId } = req.body;
    try {
        const booking = await Booking.findOne({ bookingId });
        if (booking) {
            res.render('view', { booking, error: null });
        } else {
            res.render('view', { booking: null, error: 'Booking not found.' });
        }
    } catch (error) {
        console.error(error);
        res.render('view', { booking: null, error: 'Error fetching booking details.' });
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
    const today = new Date().toISOString().split('T')[0];
    const todayBookings = bookings.filter(b => b.createdAt.toISOString().split('T')[0] === today);

    const totalCollection = bookings.reduce((total, b) => total + b.totalAmount, 0);
    const totalDiscount = bookings.reduce((total, b) => total + b.discount, 0);
    const totalRemaining = bookings.reduce((total, b) => total + b.remainingAmount, 0);
    const totalAdvance = bookings.reduce((total, b) => total + b.advance, 0);

    res.render('admin', {
        totalBookings: bookings.length,
        todayBookings: todayBookings.length,
        totalCollection,
        totalDiscount,
        totalRemaining,
        totalAdvance,
        bookings
    });
});

// Get Daily Booking Summary
app.post('/admin/booking-summary', checkAdmin, async (req, res) => {
    const { startDate, endDate } = req.body; 
    try {
        const bookings = await Booking.find({
            createdAt: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        });

        const dailySummary = {};

        bookings.forEach(booking => {
            const bookingDate = booking.createdAt.toISOString().split('T')[0];
            if (!dailySummary[bookingDate]) {
                dailySummary[bookingDate] = {
                    totalBookings: 0,
                    totalAmount: 0,
                    totalAdvance: 0,
                    totalRemaining: 0
                };
            }
            dailySummary[bookingDate].totalBookings += 1;
            dailySummary[bookingDate].totalAmount += booking.totalAmount;
            dailySummary[bookingDate].totalAdvance += booking.advance;
            dailySummary[bookingDate].totalRemaining += booking.remainingAmount;
        });

        res.render('booking-summary', {
            dailySummary,
            startDate,
            endDate
        });
    } catch (error) {
        console.error(error);
        res.send('Error fetching booking summary');
    }
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
        { header: 'Booked By', key: 'bookedBy' },
        { header: 'Aadhar', key: 'aadhar' },
        { header: 'Mobile', key: 'mobile' },
        { header: 'Passengers', key: 'numberOfPassengers' },
        { header: 'Total Amount', key: 'totalAmount' },
        { header: 'Advance Payment', key: 'advance' },
        { header: 'Remaining Amount', key: 'remainingAmount' },
        { header: 'Discount', key: 'discount' },
        { header: 'Created At', key: 'createdAt' },
    ];

    bookings.forEach(booking => {
        worksheet.addRow(booking.toObject());
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=bookings.xlsx');

    await workbook.xlsx.write(res);
    res.end();
});

// Booking submission route
app.post('/book', async (req, res) => {
    const {
        fromStation, toStation,
        class: travelClass, coachName,
        seatNumber, date, bookedBy,
        aadhar, mobile, numberOfPassengers,
        advancePayment, discount,
        passengerName, passengerAge, passengerAadhar, passengerMobile
    } = req.body;

    // Validate number of passengers
    const passengerCount = Number(numberOfPassengers);
    if (isNaN(passengerCount) || passengerCount < 1) {
        return res.status(400).send('Invalid number of passengers.');
    }

    const prices = { AC: 4000, Sleeper: 3000, General: 2000 };

    // Check if travel class is valid
    if (!prices[travelClass]) {
        return res.status(400).send('Invalid travel class.');
    }

    const totalAmount = prices[travelClass] * passengerCount;

    // Handle discount and advance values
    const discountAmount = parseFloat(discount) || 0; // Default to 0
    const advance = parseFloat(advancePayment) || 0; // Default to 0

    const remainingAmount = totalAmount - (advance + discountAmount);

    // Prepare passenger details
    const passengers = passengerName.map((name, index) => ({
        name,
        aadhar: passengerAadhar[index] || '',
        mobile: passengerMobile[index] || '',
        age: parseInt(passengerAge[index], 10) || null
    }));

    const reservationDetails = {
        bookingId: `MBDB${String(bookingIdCounter++).padStart(5, '0')}`,
        fromStation,
        toStation,
        travelClass,
        coachName,
        seatNumber: Array.isArray(seatNumber) ? seatNumber : [seatNumber], // Ensure it's an array
        date: new Date(date),
        bookedBy,
        aadhar,
        mobile,
        numberOfPassengers: passengerCount,
        totalAmount,
        advance,
        remainingAmount,
        discount: discountAmount,
        createdAt: new Date(),
        passengers
    };

    try {
        const newBooking = new Booking(reservationDetails);
        await newBooking.save();
        res.render('confirmation', { reservationDetails });
    } catch (error) {
        console.error('Error during saving booking:', error);
        res.status(500).send('Booking could not be processed.');
    }
});

// Bulk Upload for bookings
app.get('/admin/bulk-upload', checkAdmin, (req, res) => {
    res.render('upload-bulk');
});

// Handle bulk booking upload
app.post('/admin/bulk-booking', checkAdmin, upload.single('file'), async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(req.file.path);
        const worksheet = workbook.worksheets[0];
        const bookings = [];

        worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
            if (rowNumber === 1) return; // Skip header row

            const [
                fromStation, toStation, travelClass, coachName, seatNumber,
                date, bookedBy, aadhar, mobile, numberOfPassengers,
                advancePayment, discount, passengerName, passengerAadhar,
                passengerMobile, passengerAge
            ] = row.values.slice(1); // Slicing to ignore the first element (index)

            const bookingDate = new Date(date);
            if (isNaN(bookingDate.getTime())) {
                console.error(`Invalid date format at row ${rowNumber}: ${date}`);
                return; // Skip invalid date
            }

            const passengersCount = Number(numberOfPassengers);
            if (isNaN(passengersCount) || passengersCount < 1) {
                console.error(`Invalid number of passengers at row ${rowNumber}`);
                return; // Skip invalid count
            }

            const advance = parseFloat(advancePayment) || 0;
            const discountValue = parseFloat(discount) || 0;        
            const prices = { A: 4000, S: 3000, B: 2000 };
            const totalAmount = prices[travelClass] * passengersCount;
            const remainingAmount = totalAmount - (advance + discountValue);

            const names = (passengerName || "").split(',').map(name => name.trim());
            const aadhars = (passengerAadhar || "").split(',').map(aadhar => aadhar.trim());
            const mobiles = (passengerMobile || "").split(',').map(mobile => mobile.trim());
            const ages = (passengerAge || "").split(',').map(age => parseInt(age.trim(), 10));

            const passengers = names.map((name, index) => ({
                name,
                aadhar: aadhars[index] || '',
                mobile: mobiles[index] || '',
                age: ages[index] || null
            }));

            const reservationDetails = {
                bookingId: `MBDB${String(bookingIdCounter++).padStart(5, '0')}`,
                fromStation,
                toStation,
                travelClass,
                coachName,
                seatNumber: seatNumber.split(','),
                date: bookingDate,
                bookedBy,
                aadhar,
                mobile,
                numberOfPassengers: passengersCount,
                totalAmount,
                advance,
                remainingAmount,
                discount: discountValue,
                createdAt: new Date(),
                passengers
            };

            bookings.push(reservationDetails);
        });

        await Booking.insertMany(bookings);
        res.redirect('/admin');
    } catch (error) {
        console.error(error);
        res.send("Error processing the Excel file.");
    }
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
        res.setHeader('Content-disposition', `attachment; filename="payment-slip-${booking.bookingId}.pdf"`);
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);
        doc.fontSize(16).text('Payment Slip', { underline: true })
           .moveDown()
           .text(`Booking ID: ${booking.bookingId}`)
           .text(`Booked By: ${booking.bookedBy}`)
           .text(`From Station: ${booking.fromStation}`)
           .text(`To Station: ${booking.toStation}`)
           .text(`Total Amount: ₹${booking.totalAmount}`)
           .text(`Advance Payment: ₹${booking.advance}`)
           .text(`Remaining Amount: ₹${booking.remainingAmount}`)
           .text(`Discount Applied: ₹${booking.discount}`)
           .text(`Booking Date: ${booking.createdAt.toISOString().split('T')[0]}`)
           .text(`Booking Time: ${booking.createdAt.toTimeString().split(' ')[0]}`)
           .text(`Seat Number(s): ${booking.seatNumber.join(', ')}`);

        doc.end();
    } else {
        res.send("Booking not found.");
    }
});

// Home Page Route
app.get('/', (req, res) => {
    res.render('index');
});

// Bookings for Admin
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
    const {
        fromStation, toStation,
        class: travelClass, coachName,
        seatNumber, date, bookedBy,
        aadhar, mobile, numberOfPassengers,
        totalAmount, advance, discount
    } = req.body;

    const remainingAmount = totalAmount - (advance + discount);

    try {
        await Booking.updateOne(
            { bookingId: req.params.id },
            {
                fromStation,
                toStation,
                travelClass,
                coachName,
                seatNumber: seatNumber.split(','), // Expecting comma-separated values
                date,
                bookedBy,
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