import { Notification } from "../models/notificationModel.js";
import { paginationFor, paginationLinks } from "../services/pagination.js";

// Fetch notifications for the logged-in user
export const getNotifications = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const total = await Notification.count({ where: { userId } });
    const pagination = paginationLinks(paginationFor(req.query, total), req.path, req.query);
    const notifications = await Notification.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: pagination.limit, offset: pagination.offset
    });

    // Count unread
    const unreadCount = await Notification.count({
      where: { userId, isRead: false }
    });

    res.json({
      success: true,
      notifications,
      unreadCount, pagination
    });
  } catch (error) {
    console.error("Error fetching notifications:", error.name);
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

    const [affected] = await Notification.update(
      { isRead: true },
      { where: { id, userId } }
    );
    if (!affected) return res.status(404).json({ success: false, message: "Notification not found" });

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking notification as read:", error.name);
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
    console.error("Error marking all notifications as read:", error.name);
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
    console.error("Error clearing notifications:", error.name);
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
    console.error("Failed to create notification:", error.name);
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

    const total = await Notification.count({ where: { userId } });
    const pagination = paginationLinks(paginationFor(req.query, total), req.path, req.query);
    const notifications = await Notification.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: pagination.limit, offset: pagination.offset
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
      notifications: mappedNotifications, pagination
    });
  } catch (error) {
    console.error("Notifications could not be loaded:", error.name);
    res.status(503).render('notifications',{title:'Notifications - VitalMatch',user:req.session.user,notifications:[],error:'Notifications could not be loaded. Please retry.',pagination:paginationLinks(paginationFor({},0),'/notifications',{})});
  }
};
