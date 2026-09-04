
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

export const homePage = async (req, res) => {
  try {
    // Fetch all active public content sections (CMS)
    let publicContent = await PublicContent.findAll({
      where: { isActive: true },
      raw: true
    });

    const normalizeText = (value) => {
      if (typeof value !== 'string') return value;
      return value.replace(/Smart Blood Request Platform/g, 'Digital Blood Request Platform');
    };

    const normalizeContent = (item) => {
      if (!item || typeof item !== 'object') return item;
      return {
        ...item,
        title: normalizeText(item.title),
        subtitle: normalizeText(item.subtitle),
        description: normalizeText(item.description),
        primaryButtonText: normalizeText(item.primaryButtonText),
        secondaryButtonText: normalizeText(item.secondaryButtonText),
        primaryButtonLink: normalizeText(item.primaryButtonLink),
        secondaryButtonLink: normalizeText(item.secondaryButtonLink)
      };
    };

    publicContent = publicContent.map(normalizeContent);

    // Convert array to object by section for easier template access
    const contentBySection = {};
    publicContent.forEach(item => {
      contentBySection[item.section] = item;
    });

    // Filter out sections that are rendered specially on the page
    const excluded = ["hero", "callForDonation", "about"];
    const otherSections = publicContent.filter(s => !excluded.includes(s.section));

    res.render("home", { 
      title: "VitalMatch - Digital Blood Request Platform | Philippine Red Cross",
      content: contentBySection,
      sections: publicContent,
      otherSections,
      hero: contentBySection.hero || {},
      about: contentBySection.about || {},
      callForDonation: contentBySection.callForDonation || {}
    });
  } catch (error) {
    console.error("Error loading home page:", error);
    // Fallback render if database unavailable
    res.render("home", { 
      title: "VitalMatch - Digital Blood Request Platform | Philippine Red Cross",
      content: {},
      sections: []
    });
  }
};
