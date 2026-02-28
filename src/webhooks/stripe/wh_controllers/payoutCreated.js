const Payout = require("../../../models/payout.model");
const User = require("../../../models/user.model");

const markNewPayout = async (newPayout) => {
  try {

    if (!newPayout || !newPayout.amount || !newPayout.id || !newPayout.metadata || !newPayout.metadata.user) {
      console.log("Invalid payout data");
      return null;
    }
    const user = await User.findOne({
      bankId: newPayout.destination
    })

    // Create the payout record
    const createdPayout = await Payout.create({
      amount: newPayout.amount,
      date: Date.now(),
      status: newPayout.status.toLowerCase(),
      payoutId: newPayout.id,
      user: user._id,
      arriveBy: new Date(newPayout.arrival_date * 1000)
    });


    console.log("Payout created successfully");


    return createdPayout;
  } catch (e) {

    console.error("Error creating payout:", e.message);


    throw e;
  }
};

module.exports = markNewPayout;