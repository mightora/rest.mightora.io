/* Mightora REST Studio — curated public APIs and Microsoft Graph examples.
 * Requests are templates, never automatically executed. MIT licence. */
(() => {
  'use strict';
  const item = (id, group, label, description, url, scope = '', notes = '', method = 'GET', body = '') => ({
    id, group, label, description, scope, notes,
    request: {
      method, url, params: [], headers: [],
      body, bodyType: body ? 'json' : 'none'
    }
  });
  const catalogue = [
    item('local','local','Local demo','Try the interface without making any network request.','local://demo','','Works in the offline edition.'),
    item('github','public','GitHub repository','Read public metadata for Mightora’s shared UI.','https://api.github.com/repos/mightora/shared-ui','','Anonymous requests are rate-limited.'),
    item('jsonplaceholder','public','Example blog post','Fetch a realistic sample post from JSONPlaceholder.','https://jsonplaceholder.typicode.com/posts/1','','The data is illustrative, not personal.'),
    item('jsonpost','public','Create a sample post','Try a POST request with a JSON body.','https://jsonplaceholder.typicode.com/posts','','JSONPlaceholder simulates the write; nothing is saved.', 'POST', JSON.stringify({title:'Hello from Mightora',body:'A safe sample REST request',userId:1},null,2)),
    item('pokemon','public','Pokémon data','Explore nested JSON with a Pikachu record.','https://pokeapi.co/api/v2/pokemon/pikachu','','A community API; availability and CORS policies may change.'),
    item('weather','public','Current weather','Retrieve current weather near Newcastle using Open-Meteo.','https://api.open-meteo.com/v1/forecast?latitude=54.98&longitude=-1.61&current=temperature_2m,wind_speed_10m','','Weather data and API conditions may change.'),
    item('geocoding','public','Place lookup','Search for places called Newcastle using Open-Meteo.','https://geocoding-api.open-meteo.com/v1/search?name=Newcastle&count=3','','No API key needed for this example.'),
    item('countries','public','Country information','Look up public information about the United Kingdom.','https://restcountries.com/v3.1/alpha/GB?fields=name,capital,population,region','','A public community dataset.'),
    item('dataverse','special','Dataverse Web API','Start with an accounts query and replace YOUR-ORG.','https://YOUR-ORG.crm4.dynamics.com/api/data/v9.2/accounts?$top=5&$select=name,accountid','','Requires a Dataverse environment and a Dataverse access token; Microsoft Graph tokens will not work.'),
    item('graph','graph','Who am I?','See your own signed-in Microsoft 365 profile.','https://graph.microsoft.com/v1.0/me','User.Read','Recommended first Microsoft Graph request.'),
    item('graphSelect','graph','Selected profile fields','Explore Graph $select to return fewer properties.','https://graph.microsoft.com/v1.0/me?$select=displayName,mail,jobTitle,userPrincipalName','User.Read','Some properties may be blank.'),
    item('graphMail','graph','Recent email subjects','View recent mail metadata without fetching message bodies.','https://graph.microsoft.com/v1.0/me/messages?$top=5&$select=subject,receivedDateTime,from','Mail.ReadBasic','Requires a mailbox and consent. No email bodies are requested.'),
    item('graphCalendar','graph','My calendars','List your calendar names and IDs.','https://graph.microsoft.com/v1.0/me/calendars?$top=10&$select=id,name','Calendars.ReadBasic','Requires a supported mailbox.'),
    item('graphFiles','graph','My OneDrive files','List files in the root of your own OneDrive.','https://graph.microsoft.com/v1.0/me/drive/root/children?$top=10&$select=id,name,webUrl','Files.Read','A OneDrive must be provisioned for the account.'),
    item('graphDirectory','graph','Basic directory users','Show the first five people from your directory.','https://graph.microsoft.com/v1.0/users?$top=5&$select=id,displayName,userPrincipalName','User.ReadBasic.All','Tenant policy or your user role may restrict this request.')
  ];
  const scopeHelp = {
    'User.Read':'Read your own basic Microsoft 365 user profile.',
    'Mail.ReadBasic':'Read basic metadata such as message subject and sender; not message bodies.',
    'Calendars.ReadBasic':'Read basic details of your own calendars.',
    'Files.Read':'Read files you can access in your OneDrive.',
    'User.ReadBasic.All':'Read basic profiles for other users in your organisation (tenant policies may limit this).'
  };
  window.MightoraExamples = Object.freeze({
    catalogue: Object.freeze(catalogue),
    scopeHelp: Object.freeze(scopeHelp),
    get(id){ return catalogue.find(example=>example.id===id); },
    groups:{public:'Public APIs',graph:'Microsoft Graph',special:'Power Platform',local:'Offline'}
  });
})();