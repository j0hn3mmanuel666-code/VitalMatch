/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { PublicContent } from "../models/publicContentModel.js";

// Get all public content sections
export const getAllPublicContent = async (req, res) => {
  try {
    const content = await PublicContent.findAll({
      where: { isActive: true },
      order: [["updatedAt", "DESC"]]
    });

    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error("Error fetching public content:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching public content"
    });
  }
};

// Get specific section
export const getPublicContentBySection = async (req, res) => {
  try {
    const { section } = req.params;
    const content = await PublicContent.findOne({
      where: { section, isActive: true }
    });

    if (!content) {
      return res.status(404).json({
        success: false,
        message: "Content section not found"
      });
    }

    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error("Error fetching public content:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching public content"
    });
  }
};

// Create new public content section
export const createPublicContent = async (req, res) => {
  try {
    const {
      section,
      title,
      subtitle,
      description,
      primaryButtonText,
      primaryButtonLink,
      secondaryButtonText,
      secondaryButtonLink,
      imageUrl,
      metadata
    } = req.body;

    // Check if section already exists
    const existing = await PublicContent.findOne({ where: { section } });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Section already exists"
      });
    }

    const content = await PublicContent.create({
      section,
      title,
      subtitle,
      description,
      primaryButtonText,
      primaryButtonLink,
      secondaryButtonText,
      secondaryButtonLink,
      imageUrl,
      metadata,
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: "Public content created successfully",
      data: content
    });
  } catch (error) {
    console.error("Error creating public content:", error);
    res.status(500).json({
      success: false,
      message: "Error creating public content"
    });
  }
};

// Update public content section
export const updatePublicContent = async (req, res) => {
  try {
    const { section } = req.params;
    const {
      title,
      subtitle,
      description,
      primaryButtonText,
      primaryButtonLink,
      secondaryButtonText,
      secondaryButtonLink,
      imageUrl,
      isActive,
      metadata
    } = req.body;

    const content = await PublicContent.findOne({ where: { section } });
    if (!content) {
      return res.status(404).json({
        success: false,
        message: "Content section not found"
      });
    }

    // Use explicit undefined checks so empty strings from the form
    // are saved (instead of keeping the old value when falsy).
    await content.update({
      title: title !== undefined ? title : content.title,
      subtitle: subtitle !== undefined ? subtitle : content.subtitle,
      description: description !== undefined ? description : content.description,
      primaryButtonText: primaryButtonText !== undefined ? primaryButtonText : content.primaryButtonText,
      primaryButtonLink: primaryButtonLink !== undefined ? primaryButtonLink : content.primaryButtonLink,
      secondaryButtonText: secondaryButtonText !== undefined ? secondaryButtonText : content.secondaryButtonText,
      secondaryButtonLink: secondaryButtonLink !== undefined ? secondaryButtonLink : content.secondaryButtonLink,
      imageUrl: imageUrl !== undefined ? imageUrl : content.imageUrl,
      isActive: isActive !== undefined ? isActive : content.isActive,
      metadata: metadata !== undefined ? metadata : content.metadata
    });

    res.json({
      success: true,
      message: "Public content updated successfully",
      data: content
    });
  } catch (error) {
    console.error("Error updating public content:", error);
    res.status(500).json({
      success: false,
      message: "Error updating public content"
    });
  }
};

// Delete public content section
export const deletePublicContent = async (req, res) => {
  try {
    const { section } = req.params;

    const content = await PublicContent.findOne({ where: { section } });
    if (!content) {
      return res.status(404).json({
        success: false,
        message: "Content section not found"
      });
    }

    await content.update({ isActive: false });

    res.json({
      success: true,
      message: "Public content deactivated successfully"
    });
  } catch (error) {
    console.error("Error deleting public content:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting public content"
    });
  }
};

// Admin page to view and manage all public content
export const adminPublicContentPage = async (req, res) => {
  try {
    const content = await PublicContent.findAll({
      order: [["section", "ASC"]]
    });

    res.render("admin-public-cms", {
      layout: "admin",
      title: "Public CMS Management",
      content,
      user: req.user
    });
  } catch (error) {
    console.error("Error loading admin public content page:", error);
    res.render("error", {
      message: "Error loading CMS page",
      error
    });
  }
};
