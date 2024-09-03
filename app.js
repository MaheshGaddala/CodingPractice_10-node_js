const express = require("express");
const app = express();

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");

const path = require("path");
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const jwt = require("jsonwebtoken");
app.use(express.json());
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const convertStateDbObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDistrictDbObjectToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

const authenticateToken = (req, res, next) => {
  let jwtToken;
  const authHeader = req.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
    if (jwtToken === undefined) {
      res.status(401);
      res.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "mahesh", async (error, payload) => {
        if (error) {
          res.status(401);
          res.send("Invalid JWT Token");
        } else {
          next();
        }
      });
    }
  } else {
    res.status(401);
    res.send("Invalid JWT Token");
  }
};

app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const selectUserQuery = `
    SELECT * FROM user WHERE username="${username}"
    `;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    res.status(400);
    res.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === false) {
      res.status(400);
      res.send("Invalid password");
    } else {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "mahesh");
      res.send({ jwtToken });
    }
  }
});

app.get("/states/", authenticateToken, async (req, res) => {
  const getStatesQuery = `SELECT * FROM state`;
  const dbStates = await db.all(getStatesQuery);
  res.send(
    dbStates.map((eachState) => convertStateDbObjectToResponseObject(eachState))
  );
});

app.get("/states/:stateId", authenticateToken, async (req, res) => {
  const { stateId } = req.params;
  const getStateQuery = `SELECT * FROM state WHERE state_id=${stateId}`;
  const dbState = await db.get(getStateQuery);
  res.send(convertStateDbObjectToResponseObject(dbState));
});

app.post("/districts/", authenticateToken, async (req, res) => {
  const districtDetails = req.body;
  console.log(districtDetails);
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;
  const addDistrictQuery = `
  INSERT INTO district(district_name,state_id,cases,cured,active,deaths)
  VALUES(
      "${districtName}",
      "${stateId}",
      "${cases}",
      "${cured}",
      "${active}",
      "${deaths}"
  );`;
  const dbResponse = await db.run(addDistrictQuery);
  const districtId = dbResponse.lastID;
  console.log(dbResponse);
  res.send("District Successfully Added");
});

app.get("/districts/:districtId", authenticateToken, async (req, res) => {
  const { districtId } = req.params;
  const getDistrictQuery = `SELECT * FROM district WHERE district_id=${districtId}`;
  const dbDistrict = await db.get(getDistrictQuery);
  res.send(convertDistrictDbObjectToResponseObject(dbDistrict));
});

app.delete("/districts/:districtId", authenticateToken, async (req, res) => {
  const { districtId } = req.params;
  const getDistrictQuery = `DELETE FROM district WHERE district_id=${districtId}`;
  const dbDistrict = await db.run(getDistrictQuery);
  res.send("District Removed");
});

app.put("/districts/:districtId", authenticateToken, async (req, res) => {
  const districtDetails = req.body;
  const { districtId } = req.params;

  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;

  try {
    const updateDistrictQuery = `
      UPDATE district 
      SET 
        district_name = ?, 
        state_id = ?, 
        cases = ?, 
        cured = ?, 
        active = ?, 
        deaths = ?
      WHERE district_id = ?`;

    const dbResponse = await db.run(updateDistrictQuery, [
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
      districtId,
    ]);

    if (dbResponse.changes === 0) {
      return res.status(404).send("District not found");
    }

    res.send("District Details Updated");
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/states/:stateId/stats/", authenticateToken, async (req, res) => {
  const { stateId } = req.params;
  const getStatsQuery = `SELECT SUM(cases) AS "totalCases",
    SUM(cured) AS "totalCured",
    SUM(active) AS "totalActive",
    SUM(deaths) AS "totalDeaths"
     FROM district WHERE state_id=${stateId};`;
  const totalStats = await db.get(getStatsQuery);
  res.send(totalStats);
});

module.exports = app;
