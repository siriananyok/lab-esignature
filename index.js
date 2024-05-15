const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
dotenv.config();

const docusign = require('docusign-esign');
const fs = require('fs');

const session = require('express-session');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'randonstring1test',
  resave: true,
  saveUninitialized: true,
}));

function getEnvelopesApi(request) {
  let dsApiClient = new docusign.ApiClient();

  dsApiClient.setBasePath(process.env.DOCUSIGN_ACCOUNT_BASE_URL);
  dsApiClient.addDefaultHeader('Authorization', 'Bearer ' + request.session.access_token);

  return new docusign.EnvelopesApi(dsApiClient);
}

function makeEnvelope(name, email){
  let env = new docusign.EnvelopeDefinition();
  env.templateId = process.env.DOCUSIGN_TEMPLATE_ID;

  //  const text = docusign.Text.constructFromObject({
  //     tabLabel: 'company_name', value: company});

  //  // Pull together the existing and new tabs in a Tabs object:
  //  let tabs = docusign.Tabs.constructFromObject({
  //     textTabs: [text],
  //  });

  const signer1 = docusign.TemplateRole.constructFromObject({
    email: email,
    name: name,
    clientUserId: process.env.DOCUSIGN_CLIENT_USER_ID,
    roleName: 'Applicant'
  });

  env.templateRoles = [signer1];
  env.status = 'sent';

  return env;
}

function makeRecipientViewRequest(name, email) {
  let viewRequest = new docusign.RecipientViewRequest();

  viewRequest.returnUrl = 'http://localhost:8000/success';
  viewRequest.authenticationMethod = 'none';

  viewRequest.email = email;
  viewRequest.userName = name;
  viewRequest.clientUserId = process.env.DOCUSIGN_CLIENT_USER_ID;

  return viewRequest;
}

async function checkToken(request) {
  if (request.session.access_token && Date.now() < request.session.expires_at) {
    console.log('re-using access_token ', request.session.access_token);
  } else {
    let dsApiClient = new docusign.ApiClient();
    dsApiClient.setBasePath(process.env.DOCUSIGN_ACCOUNT_BASE_URL);

    console.log(dsApiClient);

    const results = await dsApiClient.requestJWTUserToken(
      process.env.DOCUSIGN_INTEGRATION_KEY,
      process.env.DOCUSIGN_USER_ID,
      'signature',
      fs.readFileSync(path.join(__dirname, 'private.key')),
      3600
    );

    console.log(results.body);

    request.session.access_token = results.body.access_token;
    request.session.expires_at = Date.now() + (results.body.expires_in - 60) * 1000;
  }
}

app.get('/', async (request, response) => {
  await checkToken(request);

  response.sendFile(path.join(__dirname, 'main.html'));
});

app.get('/success', (request, resposne) => {
  resposne.send('Success');
});

app.post('/form', async (request, response) => {
  await checkToken(request);

  const envelopesApi = getEnvelopesApi(request);
  const envelope = makeEnvelope(request.body.name, request.body.email);

  let results = await envelopesApi.createEnvelope(
    process.env.DOCUSIGN_ACCOUNT_ID, 
    {
      envelopeDefinition: envelope
    }
  );

  console.log('envelope results ', results);

  const viewRequest = makeRecipientViewRequest(request.body.name, request.body.email);

  results = await envelopesApi.createRecipientView(
    process.env.DOCUSIGN_ACCOUNT_ID,
    results.envelopeId,
    {
      recipientViewRequest: viewRequest
    }
  );

  response.redirect(results.url);
  // response.send('received');
});

app.listen(8000, () => {
  console.log('server has started', process.env.DOCUSIGN_USER_ID);
});

//https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=a110c4cd-216d-46c9-bc87-f6a7fca94a46&redirect_uri=http://localhost:8000/