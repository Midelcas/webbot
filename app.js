/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework.
-----------------------------------------------------------------------------*/

var restify = require('restify');
var builder = require('botbuilder');
var azure = require('azure-storage');
var botbuilder_azure = require("botbuilder-azure");

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url);
});

// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    openIdMetadata: process.env.BotOpenIdMetadata
});

// Listen for messages from users
server.post('/api/messages', connector.listen());

/*----------------------------------------------------------------------------------------
* Bot Storage: This is a great spot to register the private state storage for your bot.
* We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
* For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
* ---------------------------------------------------------------------------------------- */

var tableName = 'botdata';
var azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
var tableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, azureTableClient);
var queueName = process.env.BotQueueName || 'bot-queue';

// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector);
bot.set('storage', tableStorage);

// Intercept trigger event (ActivityTypes.Trigger)
bot.on('trigger', function (message) {
    // handle message from trigger function
    var queuedMessage = message.value;
    var text='**'+queuedMessage.text[0].deviceId+"**:";
    if(queuedMessage.text[0].alertTime){
        text= text+' **Type:** Alert';
    }else{
        text= text+' **Type:** Telemetry';
    }
    for (var i = 0; i < queuedMessage.qty; i++) {
        text= text+ ' **Timestamp:** ' + queuedMessage.text[i].Timestamp;
        if(queuedMessage.text[i].temperature){
            text = text+' **Temperature:**'+ queuedMessage.text[i].temperature;
        }
        if(queuedMessage.text[i].humidity){
            text = text+' **Humidity:**'+ queuedMessage.text[i].humidity;
        }
    }
 
    var reply = new builder.Message()
        .address(queuedMessage.address)
        .text(text);
    bot.send(reply);
});

// Handle message from user
bot.dialog('/', function (session) {
    //var queuedMessage = { address: session.message.address, text: session.message.text};
    // add message to queue
    session.sendTyping();
    if(session.message.text=='Help'){
        session.send('Bot command: <idDevice=FLOW|ESP32|SIMULATED|EDGE|RPI> <qty=number> <type=ALERT|TELEMETRY>');
    }else{
        session.message.text=session.message.text+" ";
        var id = "undefined";
        var tableName = 'undefined';
        if(session.message.text.includes('RPI')){
            id = 'g5-rpi-simulated';
        }else if(session.message.text.includes('FLOW')){
            id = 'g5-flow-simulatator';
        }else if(session.message.text.includes('ESP32')){
            id = 'g5-iotdevice-esp32-si7021';
        }else if(session.message.text.includes('SIMULATED')){
            id = 'g5-iotdevice-simulated';
        }else if(session.message.text.includes('EDGE')){
            id = 'g5-iotedge-rpi';
        }
        
        if(session.message.text.includes('ALERT')){
            tableName = 'DEVICEALERT';
        }else if(session.message.text.includes('TELEMETRY')){
            tableName = 'DEVICETELEMETRY';
        }
        
        var splitted = session.message.text.split(" ");
        var quantity = 1;
        for (var i = 0; i < splitted.length - 1; i++) {
            if(!isNaN(splitted[i])){
                quantity=parseInt(splitted[i],10);
            }
        }
        if (quantity > 20){
            quantity = 20;
        }
        if(id == 'undefined' || tableName == 'undefined'){
            session.send('One or more parameters invalid');
        }else{
           var queuedMessage = { address: session.message.address, id: id, tableName: tableName, quantity: quantity, text: session.message.text};
            var queueSvc = azure.createQueueService(process.env.AzureWebJobsStorage);
            queueSvc.createQueueIfNotExists(queueName, function(err, result, response){
                if(!err){
                    // Add the message to the queue
                    var queueMessageBuffer = new Buffer(JSON.stringify(queuedMessage)).toString('base64');
                    queueSvc.createMessage(queueName, queueMessageBuffer, function(err, result, response){
                        if(!err){
                            // Message inserted
                            //session.send('Your message (\'' + session.message.text +'\') has been added to a queue, and it will be sent back to you via a Function');
                            session.send('ID:' + queuedMessage.id + '\n\rTYPE:' + queuedMessage.tableName + '\n\rQuantity: ' + queuedMessage.quantity);
                        } else {
                            // this should be a log for the dev, not a message to the user
                            session.send('There was an error inserting your message into queue');
                        }
                    });
                } else {
                    // this should be a log for the dev, not a message to the user
                    session.send('There was an error creating your queue');
                }
            }); 
        }        
    }
});
