/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import { BloodRequest } from "../models/bloodRequestModel.js";

export const confirmSchedule = async (req, res) => {
  try {
    const { id, role } = req.params;
    
    const request = await BloodRequest.findByPk(id);
    if (!request) {
      return res.status(404).render('404', {
        title: 'Request Not Found',
        message: 'The requested appointment could not be found.'
      });
    }
    
    if (role === 'donor') {
      await request.update({ donorConfirmed: true });
    } else if (role === 'requester') {
      await request.update({ requesterConfirmed: true });
    } else {
      return res.status(400).render('404', {
        title: 'Invalid Link',
        message: 'The confirmation link is invalid.'
      });
    }
    
    res.render('schedule-confirmed', {
      title: 'Schedule Confirmed - VitalMatch',
      role,
      request: request.toJSON()
    });
  } catch (error) {
    console.error('Error confirming schedule:', error);
    res.status(500).send('An error occurred while confirming the schedule.');
  }
};
