const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
    username: {type: String, unique: true},
    password: String,
    email: { type: String, sparse: true },
    passwordResetToken:   { type: String },
    passwordResetExpires: { type: Date },
}, {timestamps: true})

const UserModel = mongoose.model('User', UserSchema)

module.exports = UserModel
