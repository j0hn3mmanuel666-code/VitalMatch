import { Notification } from "../models/notificationModel.js";

// Fetch notifications for the logged-in user
export const getNotifications = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const notifications = await Notification.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 50 // Limit to last 50 notifications
    });

    // Count unread
    const unreadCount = await Notification.count({
      where: { userId, isRead: false }
    });

    res.json({
      success: true,
      notifications,
      unreadCount
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Mark a specific notification as read
export const markAsRead = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    await Notification.update(
      { isRead: true },
      { where: { id, userId } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Mark all notifications as read for the user
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    await Notification.update(
      { isRead: true },
      { where: { userId, isRead: false } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Clear/delete all notifications for the user
export const clearAll = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    await Notification.destroy({ where: { userId } });

    res.json({ success: true });
  } catch (error) {
    console.error("Error clearing notifications:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Internal utility function to trigger a new notification
export const createNotification = async (userId, title, message, type = "info", link = null) => {
  try {
    await Notification.create({
      userId,
      title,
      message,
      type,
      link
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
};

// Render the dedicated notifications page
export const notificationsPage = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      req.flash("error_msg", "Please log in to view notifications");
      return res.redirect("/login");
    }

    const notifications = await Notification.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 100
    });

    const mappedNotifications = notifications.map(n => {
      const plain = n.get({ plain: true });
      // If the link is just the dashboard, remove it so we don't show a confusing 'View Details' button
      if (plain.link === '/dashboard' || plain.link === '/') {
        plain.link = null;
      }
      return plain;
    });

    res.render("notifications", {
      title: "Notifications - VitalMatch",
      user: req.session.user,
      notifications: mappedNotifications
    });
  } catch (error) {
    console.error("Error rendering notifications page:", error);
    req.flash("error_msg", "Error loading notifications");
    res.redirect("/dashboard");
  }
};
