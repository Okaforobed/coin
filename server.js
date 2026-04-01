const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const axios = require("axios");
const serviceAccount = require("./serviceAccountKey.json");
const PORT = process.env.PORT || 3000;

admin.initializeApp({
credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();
app.use(cors());
app.use(express.json());

const PAYSTACK_SECRET = "sk_live_e1432fea2db8da3fb2d419a57041587bf1716164"; // replace with your key

// VERIFY ACCOUNT
app.post("/verify-account", async (req,res)=>{
const {account_number, bank_code}=req.body;
try{
const response = await axios.get(`https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,{
headers:{Authorization:`Bearer ${PAYSTACK_SECRET}`}
});
res.json(response.data.data);
}catch{res.status(400).json({error:"Invalid account"});}
});

// DEPOSIT
app.post("/deposit", async(req,res)=>{
const {uid,amount}=req.body;
const ref = db.collection("users").doc(uid);
const doc = await ref.get();
await ref.update({balance:(doc.data().balance||0)+Number(amount)});
res.json({success:true});
});

// WITHDRAW
app.post("/withdraw", async(req,res)=>{
const {uid,amount,account_number,bank_code}=req.body;
const ref=db.collection("users").doc(uid);
const doc=await ref.get();
let user=doc.data();
if((user.balance||0)<amount) return res.json({error:"Insufficient balance"});
try{
// create recipient
const recipient = await axios.post("https://api.paystack.co/transferrecipient",
{type:"nuban",name:user.name,account_number,bank_code,currency:"NGN"},
{headers:{Authorization:`Bearer ${PAYSTACK_SECRET}`}});
await axios.post("https://api.paystack.co/transfer",
{source:"balance",amount:amount*100,recipient:recipient.data.data.recipient_code},
{headers:{Authorization:`Bearer ${PAYSTACK_SECRET}`}});
await ref.update({balance:user.balance-Number(amount)});
res.json({success:true});
}catch(err){console.log(err.response?.data);res.json({error:"Transfer failed"});}
});

// TRANSFER
app.post("/transfer", async(req,res)=>{
const {senderUid,receiverAcc,amount}=req.body;
const senderRef=db.collection("users").doc(senderUid);
const senderDoc=await senderRef.get();
let sender=senderDoc.data();
if(sender.accountNumber===receiverAcc) return res.json({error:"Cannot send to yourself"});
if((sender.balance||0)<amount) return res.json({error:"Insufficient balance"});
const snap = await db.collection("users").where("accountNumber","==",receiverAcc).get();
if(snap.empty) return res.json({error:"User not found"});
const receiverRef=db.collection("users").doc(snap.docs[0].id);
let receiver=snap.docs[0].data();
await senderRef.update({balance:sender.balance-Number(amount)});
await receiverRef.update({balance:(receiver.balance||0)+Number(amount)});
res.json({success:true});
});

// VAULT SAVE
app.post("/vault-save", async(req,res)=>{
const {uid,amount,releaseDate}=req.body;
const ref=db.collection("users").doc(uid);
const doc=await ref.get();
let user=doc.data();
if((user.balance||0)<amount) return res.json({error:"Insufficient balance"});
let vault=user.vault||[];
vault.push({amount:Number(amount),release:releaseDate});
await ref.update({balance:user.balance-Number(amount),vault});
res.json({success:true});
});

// GOLD
app.post("/gold-action", async(req,res)=>{
const {uid,action,goldName,price,qty}=req.body;
const ref=db.collection("users").doc(uid);
const doc=await ref.get();
let user=doc.data();
let balance=user.balance||0;
let gold=user.gold||{};
if(action==="buy"){
if(balance<price) return res.json({error:"Insufficient balance"});
balance-=price;
if(!gold[goldName]) gold[goldName]={qty:0,buyPrice:price};
gold[goldName].qty+=qty;
}
await ref.update({balance,gold});
res.json({success:true});
});

app.listen( PORT,() => {
    console.log("Server running on port"+PORT)
});



