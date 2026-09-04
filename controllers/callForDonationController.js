import { CallForDonation } from "../models/callForDonationModel.js";

// Handle form submission from the landing page
export const submitCall = async (req, res) => {
  try {
    const {
      fullName,
      age,
      weight,
      bloodType,
      gender,
      contactNumber,
      hasTattoo,
      location,
      message
    } = req.body;

    // Basic validation
    if (!fullName || !age || !weight || !bloodType || !gender || !contactNumber || !hasTattoo || !location) {
      req.flash("error_msg", "Please fill in all required fields.");
      return res.redirect("/#call-for-donation-section");
    }

    // Save to database
    await CallForDonation.create({
      fullName,
      age: parseInt(age),
      weight,
      bloodType,
      gender,
      contactNumber,
      hasTattoo,
      location,
      message
    });

    res.redirect("/?success=call");
  } catch (error) {
    console.error("Error submitting call for donation:", error);
    req.flash("error_msg", "An error occurred while submitting. Please try again.");
    res.redirect("/#call-for-donation-section");
  }
};

// Fetch all submissions for the admin dashboard
export const adminViewCalls = async (req, res) => {
  try {
    // Get filter from query params
    const filter = req.query.filter;
    const whereClause = {};

    if (filter === "pending") {
      whereClause.status = "Pending";
    } else if (filter === "contacted") {
      whereClause.status = "Contacted";
    }

    const calls = await CallForDonation.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]]
    });

    res.render("admin-calls", {
      layout: "admin",
      title: "Call for Donations - Admin",
      calls: calls.map(c => c.toJSON()),
      filter
    });
  } catch (error) {
    console.error("Error fetching call for donations:", error);
    res.render("admin-calls", {
      layout: "admin",
      title: "Call for Donations - Admin",
      calls: [],
      error: "Failed to load data"
    });
  }
};

// Update status
export const adminUpdateCallStatus = async (req, res) => {
  try {
    const { id, status } = req.body;
    await CallForDonation.update({ status }, { where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ success: false });
  }
};
