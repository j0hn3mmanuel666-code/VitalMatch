import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";

export const UserSetting = sequelize.define("UserSetting", {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: { model: User, key: "id" },
    onDelete: "CASCADE"
  },
  notifyMatches: { type: DataTypes.BOOLEAN, defaultValue: true },
  notifyAppointments: { type: DataTypes.BOOLEAN, defaultValue: true },
  emailUpdates: { type: DataTypes.BOOLEAN, defaultValue: true }
});

User.hasMany(UserSetting, { foreignKey: "userId", as: "settings", onDelete: "CASCADE" });
UserSetting.belongsTo(User, { foreignKey: "userId", onDelete: "CASCADE" });

export async function getUserSettings(userId) {
  const [settings] = await UserSetting.findOrCreate({
    where: { userId },
    defaults: { userId }
  });
  return settings;
}

export { sequelize };
