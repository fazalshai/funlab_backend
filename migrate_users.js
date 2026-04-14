require("dotenv").config();
const { MongoClient } = require("mongodb");

const idToNameMap = {
    4: { name: "Madhu", regNo: "REG004" },
    5: { name: "Lahari", regNo: "REG005" },
    6: { name: "Swetha", regNo: "REG006" },
    7: { name: "Priyanka", regNo: "REG007" },
    8: { name: "Jacky", regNo: "REG008" },
    9: { name: "Fazal", regNo: "REG009" },
    10: { name: "Firoj Gazi", regNo: "REG010" },
    11: { name: "Jahnava", regNo: "REG011" },
    12: { name: "Greeshma", regNo: "REG012" },
    13: { name: "Divya", regNo: "REG013" },
    14: { name: "AKash Harsha", regNo: "REG014" },
    15: { name: "Hemanth", regNo: "REG015" },
    16: { name: "Sulthan", regNo: "REG016" },
    17: { name: "Sasikanth", regNo: "REG017" },
    18: { name: "Ashwini ", regNo: "REG018" },
    19: { name: "Siddu", regNo: "REG019" },
    20: { name: "Musavvir", regNo: "REG020" },
    21: { name: "Devi Sree", regNo: "REG021" },
    22: { name: "Sahadeb", regNo: "REG022" },
    23: { name: "Abdussami", regNo: "REG023" },
    24: { name: "Surraya", regNo: "REG024" },
    25: { name: "Sanjay", regNo: "REG025" },
    26: { name: "Usman", regNo: "REG026" },
    27: { name: "Dyani", regNo: "REG027" },
    28: { name: "Alekhya", regNo: "REG028" },
    29: { name: "Smitha", regNo: "REG029" },
    30: { name: "Sahaja", regNo: "REG030" },
    31: { name: "Daiwik ", regNo: "REG029" },
    32: { name: "Chakraborty", regNo: "REG030" },
    33: { name: "Pavan varma", regNo: "REG029" },
    34: { name: "Jyoshika", regNo: "REG030" },
    35: { name: "Ravi kumar ", regNo: "REG029" },
    36: { name: "Harsh jaiswal", regNo: "REG030" },
    37: { name: "Aman Raj", regNo: "REG029" },
    38: { name: "Arnavameshar", regNo: "REG030" },
    39: { name: "fazal", regNo: "REG029" },
    40: { name: "Abhishek", regNo: "REG030" },
};

async function migrate() {
    const client = new MongoClient(process.env.MONGO_URI);

    try {
        await client.connect();
        const db = client.db("funlab");
        const namesCollection = db.collection("names");

        console.log("Starting migration...");

        for (const [id, data] of Object.entries(idToNameMap)) {
            await namesCollection.updateOne(
                { id: id },
                { $set: { name: data.name, regNo: data.regNo } },
                { upsert: true }
            );
            console.log(`Migrated: ID ${id} -> ${data.name}`);
        }

        console.log("✅ Migration complete! All static users are now in the database.");

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.close();
    }
}

migrate();
