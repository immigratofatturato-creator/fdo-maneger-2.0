const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const customDbPath = process.env.DATABASE_FILE_PATH || process.env.DB_PATH;
const dbPath = customDbPath ? path.resolve(customDbPath) : path.join(__dirname, 'database.json');
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
const mongoDbName = process.env.MONGO_DB_NAME || 'lspd_bot';
const useMongo = Boolean(mongoUri);

let mongoClient;
let mongoDb;

async function connectMongo() {
  if (!mongoUri) return;
  if (mongoDb) return;

  mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  mongoDb = mongoClient.db(mongoDbName);
}

function ensureDbFile() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({
      agenti: {},
      persone: {},
      arresti: {},
      denuncie: {},
      multe: {},
      sequestri: {},
      pda: {},
      nextArrestId: 1,
      nextDenunciaId: 1,
      nextMultaId: 1,
      nextSequestroId: 1,
      nextPdaId: 1
    }, null, 2));
  }
}

async function loadDatabase() {
  if (useMongo) {
    await connectMongo();
    const [agenti, persone, arresti, denuncie, multe, sequestri, pda] = await Promise.all([
      mongoDb.collection('agenti').find().toArray(),
      mongoDb.collection('persone').find().toArray(),
      mongoDb.collection('arresti').find().toArray(),
      mongoDb.collection('denuncie').find().toArray(),
      mongoDb.collection('multe').find().toArray(),
      mongoDb.collection('sequestri').find().toArray(),
      mongoDb.collection('pda').find().toArray()
    ]);

    return {
      agenti: agenti.reduce((acc, agente) => {
        acc[agente._id] = Object.assign({}, agente);
        delete acc[agente._id]._id;
        return acc;
      }, {}),
      persone: persone.reduce((acc, persona) => {
        acc[persona._id] = Object.assign({}, persona);
        delete acc[persona._id]._id;
        return acc;
      }, {}),
      arresti: arresti.reduce((acc, arresto) => {
        acc[arresto._id] = Object.assign({}, arresto);
        delete acc[arresto._id]._id;
        return acc;
      }, {}),
      denuncie: denuncie.reduce((acc, denuncia) => {
        acc[denuncia._id] = Object.assign({}, denuncia);
        delete acc[denuncia._id]._id;
        return acc;
      }, {}),
      multe: multe.reduce((acc, multa) => {
        acc[multa._id] = Object.assign({}, multa);
        delete acc[multa._id]._id;
        return acc;
      }, {}),
      sequestri: sequestri.reduce((acc, sequestro) => {
        acc[sequestro._id] = Object.assign({}, sequestro);
        delete acc[sequestro._id]._id;
        return acc;
      }, {}),
      pda: pda.reduce((acc, p) => {
        acc[p._id] = Object.assign({}, p);
        delete acc[p._id]._id;
        return acc;
      }, {})
    };
  }

  ensureDbFile();
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

async function saveDatabase(data) {
  if (useMongo) {
    return;
  }
  ensureDbFile();
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

function getPersonaId(nome, cognome, dataNascita) {
  return `${nome.trim()}-${cognome.trim()}-${dataNascita.trim()}`.toLowerCase();
}

async function getNextSequence(name) {
  if (!useMongo) {
    const db = loadDatabase();
    const field = `next${name.charAt(0).toUpperCase() + name.slice(1)}Id`;
    const nextValue = db[field] || 1;
    db[field] = nextValue + 1;
    saveDatabase(db);
    return nextValue;
  }

  await connectMongo();
  const result = await mongoDb.collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result.value.seq;
}

async function addAgente(userId, userName) {
  if (useMongo) {
    await connectMongo();
    await mongoDb.collection('agenti').updateOne(
      { _id: userId },
      { $setOnInsert: {
        nome: userName,
        oreServizio: 0,
        oreTotali: 0,
        inServizio: false,
        timbraInizio: null,
        pdaEmessi: 0,
        arresti: 0,
        multe: 0,
        sequestri: 0,
        createdAt: new Date().toISOString()
      } },
      { upsert: true }
    );
    return userId;
  }

  const db = loadDatabase();
  db.agenti[userId] = {
    nome: userName,
    oreServizio: 0,
    oreTotali: 0,
    inServizio: false,
    timbraInizio: null,
    pdaEmessi: 0,
    arresti: 0,
    multe: 0,
    sequestri: 0,
    createdAt: new Date().toISOString()
  };
  saveDatabase(db);
  return userId;
}

async function updateAgente(userId, data) {
  if (useMongo) {
    await connectMongo();
    await mongoDb.collection('agenti').updateOne(
      { _id: userId },
      { $set: data }
    );
    return;
  }

  const db = loadDatabase();
  if (db.agenti[userId]) {
    db.agenti[userId] = { ...db.agenti[userId], ...data };
    saveDatabase(db);
  }
}

async function getAgente(userId) {
  if (useMongo) {
    await connectMongo();
    const agente = await mongoDb.collection('agenti').findOne({ _id: userId });
    if (!agente) return null;
    const { _id, ...rest } = agente;
    return rest;
  }

  const db = loadDatabase();
  return db.agenti[userId] || null;
}

async function getAllAgenti() {
  if (useMongo) {
    await connectMongo();
    const agenti = await mongoDb.collection('agenti').find().toArray();
    return agenti.reduce((acc, agente) => {
      const { _id, ...rest } = agente;
      acc[_id] = rest;
      return acc;
    }, {});
  }

  const db = loadDatabase();
  return db.agenti || {};
}

async function addPersona(nome, cognome, dataNascita) {
  const personaId = getPersonaId(nome, cognome, dataNascita);
  if (useMongo) {
    await connectMongo();
    await mongoDb.collection('persone').updateOne(
      { _id: personaId },
      { $setOnInsert: {
        nome,
        cognome,
        dataNascita,
        fedina: 'pulita',
        arresti: [],
        denuncie: [],
        multe: [],
        macchineSequestrate: [],
        pda: null,
        createdAt: new Date().toISOString()
      } },
      { upsert: true }
    );
    return personaId;
  }

  const db = loadDatabase();
  if (!db.persone[personaId]) {
    db.persone[personaId] = {
      nome,
      cognome,
      dataNascita,
      fedina: 'pulita',
      arresti: [],
      denuncie: [],
      multe: [],
      macchineSequestrate: [],
      pda: null,
      createdAt: new Date().toISOString()
    };
    saveDatabase(db);
  }
  return personaId;
}

async function getPersona(nome, cognome, dataNascita) {
  const personaId = getPersonaId(nome, cognome, dataNascita);
  if (useMongo) {
    await connectMongo();
    const persona = await mongoDb.collection('persone').findOne({ _id: personaId });
    if (!persona) return null;
    const { _id, ...rest } = persona;
    return rest;
  }

  const db = loadDatabase();
  return db.persone[personaId] || null;
}

async function addArresto(agentiIds, nome, cognome, dataNascita, reati, multa, oggettiSequestrati, oggettiConsegnati, fotoUrl) {
  if (useMongo) {
    await connectMongo();
    const arrestId = await getNextSequence('arresti');
    const personaId = await addPersona(nome, cognome, dataNascita);
    const agentArray = Array.isArray(agentiIds) ? agentiIds : [agentiIds];

    const arresto = {
      _id: arrestId,
      id: arrestId,
      agenti: agentArray,
      nome,
      cognome,
      dataNascita,
      reati,
      multa,
      oggettiSequestrati,
      oggettiConsegnati,
      foto: fotoUrl,
      data: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    await mongoDb.collection('arresti').insertOne(arresto);
    await mongoDb.collection('persone').updateOne(
      { _id: personaId },
      {
        $push: { arresti: arrestId },
        $set: { fedina: 'sporca' }
      }
    );

    await Promise.all(agentArray.map(async agenteId => {
      await mongoDb.collection('agenti').updateOne(
        { _id: agenteId },
        { $inc: { arresti: 1 } }
      );
    }));

    return arrestId;
  }

  const db = loadDatabase();
  const arrestId = db.nextArrestId++;
  const personaId = addPersona(nome, cognome, dataNascita);
  
  db.arresti[arrestId] = {
    id: arrestId,
    agenti: agentiIds,
    nome,
    cognome,
    dataNascita,
    reati,
    multa,
    oggettiSequestrati,
    oggettiConsegnati,
    foto: fotoUrl,
    data: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
  
  db.persone[personaId].arresti.push(arrestId);
  db.persone[personaId].fedina = 'sporca';
  
  agentiIds.forEach(agenteId => {
    if (db.agenti[agenteId]) {
      db.agenti[agenteId].arresti++;
    }
  });
  
  saveDatabase(db);
  return arrestId;
}

async function editArresto(arrestId, data) {
  if (useMongo) {
    await connectMongo();
    await mongoDb.collection('arresti').updateOne(
      { _id: arrestId },
      { $set: data }
    );
    return;
  }

  const db = loadDatabase();
  if (db.arresti[arrestId]) {
    db.arresti[arrestId] = { ...db.arresti[arrestId], ...data };
    saveDatabase(db);
  }
}

async function removeArresto(arrestId) {
  if (useMongo) {
    await connectMongo();
    const arresto = await mongoDb.collection('arresti').findOne({ _id: arrestId });
    if (!arresto) return { success: false };

    const personaId = getPersonaId(arresto.nome, arresto.cognome, arresto.dataNascita);
    const persona = await mongoDb.collection('persone').findOne({ _id: personaId });
    const updatedArresti = (persona?.arresti || []).filter(id => id !== arrestId);
    const shouldClean = updatedArresti.length === 0 && (persona?.denuncie || []).length === 0 && (persona?.multe || []).length === 0;

    const updatePersona = {
      $pull: { arresti: arrestId }
    };
    if (shouldClean) {
      updatePersona.$set = { fedina: 'pulita' };
    }

    await mongoDb.collection('persone').updateOne({ _id: personaId }, updatePersona);

    if (Array.isArray(arresto.agenti)) {
      await Promise.all(arresto.agenti.map(async agenteId => {
        await mongoDb.collection('agenti').updateOne(
          { _id: agenteId },
          { $inc: { arresti: -1 } }
        );
      }));
    }

    await mongoDb.collection('arresti').deleteOne({ _id: arrestId });
    return { success: true, arresto, persona: Object.assign({}, persona, { arresti: updatedArresti, fedina: shouldClean ? 'pulita' : persona?.fedina }) };
  }

  const db = loadDatabase();
  const arresto = db.arresti[arrestId];
  if (!arresto) return { success: false };

  const personaId = `${arresto.nome.trim()}-${arresto.cognome.trim()}-${arresto.dataNascita.trim()}`.toLowerCase();
  if (db.persone[personaId]) {
    db.persone[personaId].arresti = db.persone[personaId].arresti.filter(id => id !== arrestId);
    if (db.persone[personaId].arresti.length === 0 && db.persone[personaId].denuncie.length === 0 && db.persone[personaId].multe.length === 0) {
      db.persone[personaId].fedina = 'pulita';
    }
  }

  if (Array.isArray(arresto.agenti)) {
    arresto.agenti.forEach(agenteId => {
      if (db.agenti[agenteId] && db.agenti[agenteId].arresti > 0) {
        db.agenti[agenteId].arresti -= 1;
      }
    });
  }

  delete db.arresti[arrestId];
  saveDatabase(db);
  return { success: true, arresto, persona: db.persone[personaId] || null };
}

async function getArresto(arrestId) {
  if (useMongo) {
    await connectMongo();
    const arresto = await mongoDb.collection('arresti').findOne({ _id: arrestId });
    if (!arresto) return null;
    const { _id, ...rest } = arresto;
    return rest;
  }

  const db = loadDatabase();
  return db.arresti[arrestId] || null;
}

async function addPda(agentiIds, nome, cognome, dataNascita, motivo, dataScadenza) {
  if (useMongo) {
    await connectMongo();
    const pdaId = await getNextSequence('pda');
    const personaId = await addPersona(nome, cognome, dataNascita);
    const agentArray = Array.isArray(agentiIds) ? agentiIds : [agentiIds];

    const pdaRecord = {
      _id: pdaId,
      id: pdaId,
      agenti: agentArray,
      nome,
      cognome,
      dataNascita,
      motivo,
      dataScadenza,
      data: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    const persona = await mongoDb.collection('persone').findOne({ _id: personaId });
    if (persona?.pda) {
      await mongoDb.collection('pda').deleteOne({ _id: persona.pda });
    }

    await mongoDb.collection('pda').insertOne(pdaRecord);
    await mongoDb.collection('persone').updateOne(
      { _id: personaId },
      { $set: { pda: pdaId } }
    );

    await Promise.all(agentArray.map(async agenteId => {
      await mongoDb.collection('agenti').updateOne(
        { _id: agenteId },
        { $inc: { pdaEmessi: 1 } }
      );
    }));

    return pdaId;
  }

  const db = loadDatabase();
  const pdaId = db.nextPdaId++;
  const personaId = addPersona(nome, cognome, dataNascita);
  
  if (db.persone[personaId].pda) {
    delete db.pda[db.persone[personaId].pda];
  }
  
  db.pda[pdaId] = {
    id: pdaId,
    agenti: Array.isArray(agentiIds) ? agentiIds : [agentiIds],
    nome,
    cognome,
    dataNascita,
    motivo,
    dataScadenza,
    data: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
  
  db.persone[personaId].pda = pdaId;
  
  (Array.isArray(agentiIds) ? agentiIds : [agentiIds]).forEach(agenteId => {
    if (db.agenti[agenteId]) {
      db.agenti[agenteId].pdaEmessi++;
    }
  });
  
  saveDatabase(db);
  return pdaId;
}

async function editPda(pdaId, data) {
  if (useMongo) {
    await connectMongo();
    await mongoDb.collection('pda').updateOne(
      { _id: pdaId },
      { $set: data }
    );
    return;
  }

  const db = loadDatabase();
  if (db.pda[pdaId]) {
    db.pda[pdaId] = { ...db.pda[pdaId], ...data };
    saveDatabase(db);
  }
}

async function getPda(pdaId) {
  if (useMongo) {
    await connectMongo();
    const pdaRecord = await mongoDb.collection('pda').findOne({ _id: pdaId });
    if (!pdaRecord) return null;
    const { _id, ...rest } = pdaRecord;
    return rest;
  }

  const db = loadDatabase();
  return db.pda[pdaId] || null;
}

async function removePda(nome, cognome, dataNascita, motivo) {
  if (useMongo) {
    await connectMongo();
    const personaId = getPersonaId(nome, cognome, dataNascita);
    const persona = await mongoDb.collection('persone').findOne({ _id: personaId });
    if (persona?.pda) {
      const pdaRecord = await mongoDb.collection('pda').findOne({ _id: persona.pda });
      await mongoDb.collection('pda').deleteOne({ _id: persona.pda });
      await mongoDb.collection('persone').updateOne({ _id: personaId }, { $set: { pda: null } });
      return { success: true, pdaRecord, motivo };
    }
    return { success: false };
  }

  const db = loadDatabase();
  const personaId = getPersonaId(nome, cognome, dataNascita);
  
  if (db.persone[personaId]?.pda) {
    const pdaRecord = db.pda[db.persone[personaId].pda];
    delete db.pda[db.persone[personaId].pda];
    db.persone[personaId].pda = null;
    saveDatabase(db);
    return { success: true, pdaRecord, motivo };
  }
  return { success: false };
}

async function addDenuncia(nome, cognome, dataNascita, data, reati, chiEspone, proveReato, fotoUrl, linkProve, createdBy) {
  if (useMongo) {
    await connectMongo();
    const denunciaId = await getNextSequence('denuncia');
    const personaId = await addPersona(nome, cognome, dataNascita);
    const denuncia = {
      _id: denunciaId,
      id: denunciaId,
      nome,
      cognome,
      dataNascita,
      data,
      reati,
      chiEspone,
      proveReato,
      foto: fotoUrl || null,
      link: linkProve || null,
      createdBy: createdBy || null,
      createdAt: new Date().toISOString()
    };
    await mongoDb.collection('denuncie').insertOne(denuncia);
    await mongoDb.collection('persone').updateOne(
      { _id: personaId },
      { $push: { denuncie: denunciaId } }
    );
    return denunciaId;
  }

  const db = loadDatabase();
  const denunciaId = db.nextDenunciaId++;
  const personaId = addPersona(nome, cognome, dataNascita);
  
  db.denuncie[denunciaId] = {
    id: denunciaId,
    nome,
    cognome,
    dataNascita,
    data,
    reati,
    chiEspone,
    proveReato,
    foto: fotoUrl || null,
    link: linkProve || null,
    createdBy: createdBy || null,
    createdAt: new Date().toISOString()
  };
  
  db.persone[personaId].denuncie.push(denunciaId);
  saveDatabase(db);
  return denunciaId;
}

async function editDenuncia(denunciaId, data) {
  if (useMongo) {
    await connectMongo();
    await mongoDb.collection('denuncie').updateOne(
      { _id: denunciaId },
      { $set: data }
    );
    return;
  }

  const db = loadDatabase();
  if (db.denuncie[denunciaId]) {
    db.denuncie[denunciaId] = { ...db.denuncie[denunciaId], ...data };
    saveDatabase(db);
  }
}

async function getDenuncia(denunciaId) {
  if (useMongo) {
    await connectMongo();
    const denuncia = await mongoDb.collection('denuncie').findOne({ _id: denunciaId });
    if (!denuncia) return null;
    const { _id, ...rest } = denuncia;
    return rest;
  }

  const db = loadDatabase();
  return db.denuncie[denunciaId] || null;
}

async function addMulta(agentiIds, nome, cognome, dataNascita, data, reato) {
  if (useMongo) {
    await connectMongo();
    const multaId = await getNextSequence('multa');
    const personaId = await addPersona(nome, cognome, dataNascita);
    const agentArray = Array.isArray(agentiIds) ? agentiIds : [agentiIds];

    const multaRecord = {
      _id: multaId,
      id: multaId,
      agenti: agentArray,
      nome,
      cognome,
      dataNascita,
      data,
      reato,
      createdAt: new Date().toISOString()
    };

    await mongoDb.collection('multe').insertOne(multaRecord);
    await mongoDb.collection('persone').updateOne(
      { _id: personaId },
      { $push: { multe: multaId } }
    );

    await Promise.all(agentArray.map(async agenteId => {
      await mongoDb.collection('agenti').updateOne(
        { _id: agenteId },
        { $inc: { multe: 1 } }
      );
    }));

    return multaId;
  }

  const db = loadDatabase();
  const multaId = db.nextMultaId++;
  const personaId = addPersona(nome, cognome, dataNascita);
  
  db.multe[multaId] = {
    id: multaId,
    agenti: Array.isArray(agentiIds) ? agentiIds : [agentiIds],
    nome,
    cognome,
    dataNascita,
    data,
    reato,
    createdAt: new Date().toISOString()
  };
  
  db.persone[personaId].multe.push(multaId);
  
  (Array.isArray(agentiIds) ? agentiIds : [agentiIds]).forEach(agenteId => {
    if (db.agenti[agenteId]) {
      db.agenti[agenteId].multe++;
    }
  });
  
  saveDatabase(db);
  return multaId;
}

async function editMulta(multaId, data) {
  if (useMongo) {
    await connectMongo();
    await mongoDb.collection('multe').updateOne(
      { _id: multaId },
      { $set: data }
    );
    return;
  }

  const db = loadDatabase();
  if (db.multe[multaId]) {
    db.multe[multaId] = { ...db.multe[multaId], ...data };
    saveDatabase(db);
  }
}

async function getMulta(multaId) {
  if (useMongo) {
    await connectMongo();
    const multa = await mongoDb.collection('multe').findOne({ _id: multaId });
    if (!multa) return null;
    const { _id, ...rest } = multa;
    return rest;
  }

  const db = loadDatabase();
  return db.multe[multaId] || null;
}

async function addSequestro(agentiIds, nome, cognome, dataNascita, data, targa, motivo, multa) {
  if (useMongo) {
    await connectMongo();
    const sequestroId = await getNextSequence('sequestro');
    const personaId = await addPersona(nome, cognome, dataNascita);
    const agentArray = Array.isArray(agentiIds) ? agentiIds : [agentiIds];

    const sequestroRecord = {
      _id: sequestroId,
      id: sequestroId,
      agenti: agentArray,
      nome,
      cognome,
      dataNascita,
      data,
      targa,
      motivo,
      multa,
      createdAt: new Date().toISOString()
    };

    await mongoDb.collection('sequestri').insertOne(sequestroRecord);
    await mongoDb.collection('persone').updateOne(
      { _id: personaId },
      { $push: { macchineSequestrate: { targa, sequestroId, data: new Date().toISOString() } } }
    );
    await Promise.all(agentArray.map(async agenteId => {
      await mongoDb.collection('agenti').updateOne(
        { _id: agenteId },
        { $inc: { sequestri: 1 } }
      );
    }));
    return sequestroId;
  }

  const db = loadDatabase();
  const sequestroId = db.nextSequestroId++;
  const personaId = addPersona(nome, cognome, dataNascita);
  
  db.sequestri[sequestroId] = {
    id: sequestroId,
    agenti: agentiIds,
    nome,
    cognome,
    dataNascita,
    data,
    targa,
    motivo,
    multa,
    createdAt: new Date().toISOString()
  };
  
  db.persone[personaId].macchineSequestrate.push({
    targa,
    sequestroId,
    data: new Date().toISOString()
  });
  
  agentiIds.forEach(agenteId => {
    if (db.agenti[agenteId]) {
      db.agenti[agenteId].sequestri++;
    }
  });
  
  saveDatabase(db);
  return sequestroId;
}

async function editSequestro(sequestroId, data) {
  if (useMongo) {
    await connectMongo();
    await mongoDb.collection('sequestri').updateOne(
      { _id: sequestroId },
      { $set: data }
    );
    return;
  }

  const db = loadDatabase();
  if (db.sequestri[sequestroId]) {
    db.sequestri[sequestroId] = { ...db.sequestri[sequestroId], ...data };
    saveDatabase(db);
  }
}

async function getSequestro(sequestroId) {
  if (useMongo) {
    await connectMongo();
    const sequestro = await mongoDb.collection('sequestri').findOne({ _id: sequestroId });
    if (!sequestro) return null;
    const { _id, ...rest } = sequestro;
    return rest;
  }

  const db = loadDatabase();
  return db.sequestri[sequestroId] || null;
}

async function removeSequestro(nome, cognome, dataNascita, targa) {
  if (useMongo) {
    await connectMongo();
    const personaId = getPersonaId(nome, cognome, dataNascita);
    const result = await mongoDb.collection('persone').updateOne(
      { _id: personaId },
      { $pull: { macchineSequestrate: { targa } } }
    );
    return result.modifiedCount > 0;
  }

  const db = loadDatabase();
  const personaId = getPersonaId(nome, cognome, dataNascita);
  
  if (db.persone[personaId]) {
    db.persone[personaId].macchineSequestrate = 
      db.persone[personaId].macchineSequestrate.filter(m => m.targa !== targa);
    saveDatabase(db);
    return true;
  }
  return false;
}

async function pulisciFedina(nome, cognome, dataNascita) {
  if (useMongo) {
    await connectMongo();
    const personaId = getPersonaId(nome, cognome, dataNascita);
    const result = await mongoDb.collection('persone').updateOne(
      { _id: personaId },
      { $set: {
        fedina: 'pulita',
        arresti: [],
        denuncie: [],
        multe: []
      } }
    );
    return result.modifiedCount > 0;
  }

  const db = loadDatabase();
  const personaId = getPersonaId(nome, cognome, dataNascita);
  
  if (db.persone[personaId]) {
    db.persone[personaId].fedina = 'pulita';
    db.persone[personaId].arresti = [];
    db.persone[personaId].denuncie = [];
    db.persone[personaId].multe = [];
    saveDatabase(db);
    return true;
  }
  return false;
}

module.exports = {
  loadDatabase,
  saveDatabase,
  addAgente,
  updateAgente,
  getAgente,
  getAllAgenti,
  addPersona,
  getPersona,
  addArresto,
  editArresto,
  removeArresto,
  getArresto,
  addPda,
  editPda,
  getPda,
  removePda,
  addDenuncia,
  editDenuncia,
  getDenuncia,
  addMulta,
  editMulta,
  getMulta,
  addSequestro,
  editSequestro,
  getSequestro,
  removeSequestro,
  pulisciFedina
};
