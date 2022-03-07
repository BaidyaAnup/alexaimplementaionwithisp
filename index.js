'use strict'
//const Alexa = require('ask-sdk-core');
const Alexa = require('ask-sdk');
const content = require('./contents.json')
const videoTemplate = require('./video_display.json')
var aplTemplateWelcome = require('./apl_template_export_welcome.json')
var aplTemplateFullList = require('./apl_template_export_horizontal_layout_fulllist.json')
var aplTemplateFullListHindi = require('./apl_template_export_horizontal_layout_fulllist_hindi.json')
const md5 = require('crypto-md5');
const axios = require('axios');
const i18n = require('i18next');
const sprintf = require('i18next-sprintf-postprocessor');
const persistenceAdapter = require('ask-sdk-s3-persistence-adapter');
const languageStrings = require('./strings');
var AWS = require('aws-sdk');
AWS.config.update({region:'eu-west-1'})



async function getSignedUrl(deityForToday){
  var smarturlAccesskey =  "ywVXaTzycwZ8agEs3ujx"
  var smarturlParams = "service_id=1&play_url=yes&protocol=hls&us="
  //var smartUrl = "http://34.227.63.170/v2/smart_urls/5bcd815f2975160650000008"
  var smartUrl = deityForToday.location[0].livestream_url
  var signature = md5(smarturlAccesskey + smartUrl + "?" + smarturlParams,'hex')
  var signed_url = smartUrl + "?" + smarturlParams + signature
  var d = new Date();
  var expires = Math.floor(d.getTime() / 1000);
  var signed_smart_url = signed_url + "&rand=" + expires
  console.log('================> signed_smart_url::' + signed_smart_url)
    try {
      const response = await axios.get(signed_smart_url);
      return response.data["adaptive_urls"][0]["playback_url"];
    } catch (error) {
      console.error(error);
    }


}

const LaunchRequestHandler = {
    canHandle(handlerInput) {
            return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
        },
        async handle(handlerInput) {
            return launchRequest(handlerInput);
        }
};


async function launchRequest(handlerInput){
    //var databaseAttribute = await attributeManager.getPersistentAttributes();
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    //const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const days = [requestAttributes.t('SUNDAY'), requestAttributes.t('MONDAY'), requestAttributes.t('TUESDAY'), requestAttributes.t('WEDNESDAY'), requestAttributes.t('THRUSDAY'), requestAttributes.t('FRIDAY'), requestAttributes.t('SATURDAY')];
    const deities = [requestAttributes.t('GANGA'), requestAttributes.t('SHIV'), requestAttributes.t('GANESH'), requestAttributes.t('KRISHNA'),requestAttributes.t('BALAJI'),requestAttributes.t('LAKSHMI'),requestAttributes.t('SHANI'),requestAttributes.t('SAI'),requestAttributes.t('GANPATI')];
    var d = new Date();
    var dayName = days[d.getDay()];

    var deityForToday = content.find(function(item,index){
      return item.day === d.getDay()
    });
    var deityName = deities[deityForToday.deity_Name] 
    var speechText = '';
    if(handlerInput.requestEnvelope.context.Viewport == null) {
      speechText = `<speak>
                        <w role="amazon:NN"> ${requestAttributes.t('WELCOME_NOTE',dayName,deityName,deityForToday.location[0].name)}</w>
                    </speak>`;
      return handlerInput.responseBuilder.speak(speechText).withShouldEndSession(false).getResponse();
    }else {
      speechText = `<speak>
                        <w role="amazon:NN"> ${requestAttributes.t('WELCOME_NOTE',dayName,deityName,deityForToday.location[0].name)}</w>
                    </speak>`;
      return handlerInput.responseBuilder.speak(speechText)
      .withShouldEndSession(false)
      .addDirective({
        type: 'Alexa.Presentation.APL.RenderDocument',
        token: '[SkillProvidedToken]',
        version: '1.0',
        document: aplTemplateWelcome.document,
        datasources: aplTemplateWelcome.datasources
      }).getResponse(); 
    }

}

const AskToPlayIntentHandler = {
    canHandle(handlerInput) {
            return (handlerInput.requestEnvelope.request.type === 'IntentRequest'
             && handlerInput.requestEnvelope.request.intent.name ==='AskToPlayIntent') || (handlerInput.requestEnvelope.request.type === 'Alexa.Presentation.APL.UserEvent' && handlerInput.requestEnvelope.request.source &&
            handlerInput.requestEnvelope.request.source.type === 'TouchWrapper');

        },
        async handle(handlerInput) {
            return askToPlayIntent(handlerInput);
        }
};

async function askToPlayIntent(handlerInput){
  if(handlerInput.requestEnvelope.request.type === 'Alexa.Presentation.APL.UserEvent'){
    var deity = handlerInput.requestEnvelope.request.arguments[0]
    console.log("==============deity on touch>>>" + deity)
  }else {
    //var deity = handlerInput.requestEnvelope.request.intent.slots.deity.value;
    var deity = handlerInput.requestEnvelope.request.intent.slots.deity.resolutions.resolutionsPerAuthority[0].values[0].value.id
    console.log("====================deity on voice>>>::" + deity)
  }
  //const deity = handlerInput.requestEnvelope.request.intent.slots.deity.value;
  const locale = handlerInput.requestEnvelope.request.locale;
  const monetizationClient = handlerInput.serviceClientFactory.getMonetizationServiceClient();
  const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
  const deities = [requestAttributes.t('GANGA'), requestAttributes.t('SHIV'), requestAttributes.t('GANESH'), requestAttributes.t('KRISHNA'), requestAttributes.t('SAI'), requestAttributes.t('LAKSHMI'), requestAttributes.t('SHANI'),requestAttributes.t('GANPATI')];
  var speechText = '';
  var offset = 0
  var play = content.find(function(item,index){
    return item.deityId.toLowerCase() === deity.toLowerCase()
  });
  var url =  await getSignedUrl(play)
  var sessionAttribute = handlerInput.attributesManager.getSessionAttributes();
  if(sessionAttribute == null) {
    sessionAttribute = {};
  }
  sessionAttribute.url = url;    
  handlerInput.attributesManager.setSessionAttributes(sessionAttribute);

  handlerInput.attributesManager.setPersistentAttributes({"play_url": url,"deity_location": play.location[0].name,"deity_name": play.deity_Name,"free_audio_url": play.free_audio_url})
  handlerInput.attributesManager.savePersistentAttributes()

   return monetizationClient.getInSkillProducts(locale).then((res) => {
    // Use the helper function getResponseBasedOnAccessType to determine the response based on the products the customer has purchased
    return getResponseBasedOnAccessType(handlerInput, res, speechText);
    });     

}

const VideoEndedEventHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'Alexa.Presentation.APL.UserEvent'
        && handlerInput.requestEnvelope.request.arguments &&
            handlerInput.requestEnvelope.request.arguments[0] === 'video_finished'
    },
    async handle(handlerInput) {
        console.log(`UserEventHandler: ${JSON.stringify(handlerInput.requestEnvelope.request)}`);

  			var sessionAttribute = await handlerInput.attributesManager.getSessionAttributes();
        var persistenceAttributes = await handlerInput.attributesManager.getPersistentAttributes();
        console.log(`Usersessions: ${JSON.stringify(sessionAttribute)}`);
        console.log("i m videdendedintent=======>::sessionAttribute.url::" + sessionAttribute.url)
  			if(sessionAttribute == null) {
  				sessionAttribute = {};
  			}
        // var deityForToday = content.find(function(item,index){
        //   return item.day === d.getDay()
        // });
        // var url =  await getSignedUrl(deityForToday)
        var dataSource = {
        //dynamically populate the JSON Array below
          videoTemplateData: {
            type: "object",
            videoUrl: [
                {
                  url : persistenceAttributes.play_url 
                }
              ]
            }
          };
          return handlerInput.responseBuilder
          .addDirective({
            type: 'Alexa.Presentation.APL.RenderDocument',
            token: '[SkillProvidedToken]',
            version: '1.0',
            document: videoTemplate.document,
            datasources: dataSource
          }).getResponse();
  }
};



const YesNoIntentHandler = {
    canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest' && (handlerInput.requestEnvelope.request.intent.name === 'AMAZON.NoIntent' || handlerInput.requestEnvelope.request.intent.name === 'AMAZON.YesIntent');
  },
  async handle(handlerInput) {
    var speechText = '';
    var offset = 0
    //var databaseAttribute = await attributeManager.getPersistentAttributes();
    const locale = handlerInput.requestEnvelope.request.locale;
    const monetizationClient = handlerInput.serviceClientFactory.getMonetizationServiceClient();
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    var d = new Date();
    var deityForToday = content.find(function(item,index){
      return item.day === d.getDay()
    }); 
    var url =  await getSignedUrl(deityForToday)
    var sessionAttribute = handlerInput.attributesManager.getSessionAttributes();
    if(sessionAttribute == null) {
      sessionAttribute = {};
    }
    var deity_location = deityForToday.location[0].name
    sessionAttribute = {"url": url,"deity_location": deity_location,"deity_location": deityForToday.deity_Name }
    handlerInput.attributesManager.setSessionAttributes(sessionAttribute);
    handlerInput.attributesManager.setPersistentAttributes({"play_url": url,"deity_location": deity_location,"deity_name": deityForToday.deity_Name,"free_audio_url": deityForToday.free_audio_url})
    handlerInput.attributesManager.savePersistentAttributes()

    //const deities = [requestAttributes.t('GANGA'), requestAttributes.t('SHIV'), requestAttributes.t('GANESH'), requestAttributes.t('KRISHNA'), requestAttributes.t('SAI'), requestAttributes.t('LAKSHMI'), requestAttributes.t('SHANI'),requestAttributes.t('GANPATI')];
    if(handlerInput.requestEnvelope.request.intent.name === 'AMAZON.YesIntent') {
        return monetizationClient.getInSkillProducts(locale).then((res) => {
          // Use the helper function getResponseBasedOnAccessType to determine the response based on the products the customer has purchased
          return getResponseBasedOnAccessType(handlerInput, res, speechText);
        });
           
    }else if(handlerInput.requestEnvelope.request.intent.name === 'AMAZON.NoIntent') {
      if(handlerInput.requestEnvelope.context.Viewport == null) {
        var speechText = '<speak>' + requestAttributes.t('QUERY_ONE') + '</speak>';
        return handlerInput.responseBuilder.speak(speechText).withShouldEndSession(false).getResponse();
      } else {
        console.log("--------------> I am no intent")
        var speechText = '<speak>' + requestAttributes.t('QUERY_ONE') + '</speak>'; 
        if(handlerInput.requestEnvelope.request.locale === "hi-IN"){
          var apl_doc = aplTemplateFullListHindi.document
          var apl_data = aplTemplateFullListHindi.datasources
        }else {
          var apl_doc = aplTemplateFullList.document
          var apl_data = aplTemplateFullList.datasources
        }     
        return handlerInput.responseBuilder.speak(speechText)
        .withShouldEndSession(false)
        .addDirective({
          type: 'Alexa.Presentation.APL.RenderDocument',
          token: '[SkillProvidedToken]',
          version: '1.0',
          document: apl_doc,
          datasources: apl_data
        }).getResponse();                       
      }
    }
  }
};


const PauseIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.PauseIntent';
    },
    async handle(handlerInput) {
      var speechText = ""
      if(handlerInput.requestEnvelope.context.Viewport == null) {
        console.log("=============> I m PauseIntent audio")
         console.log(`request handler error:: ${JSON.stringify(handlerInput.requestEnvelope.request)}`)
        return handlerInput.responseBuilder
        .addAudioPlayerStopDirective()
        .getResponse();
      }else{
        console.log("=============> I m PauseIntent video")
         return handlerInput.responseBuilder
        .addDirective({
           type: "Alexa.Presentation.APL.ExecuteCommands",
           token: "[SkillProvidedToken]",
           commands: [{
               type: "ControlMedia",
               componentId: "VideoPlayer",
               command: "pause"
           }]
          })
          .getResponse();

      }
    }
};


const AudioPlayerIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type.startsWith('AudioPlayer.');
  },
  async handle(handlerInput){
     const audioPlayerEventName = handlerInput.requestEnvelope.request.type.split('.')[1];
     console.log(`AudioPlayer event encountered: ${handlerInput.requestEnvelope.request.type}`);

     switch (audioPlayerEventName) {
       case 'PlaybackStarted':
         break;
       case 'PlaybackStopped':
         break;
       default:
         break;
     }
  }
}

const ResumeIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.ResumeIntent';
  },
  async handle(handlerInput){
        var sessionAttribute = handlerInput.attributesManager.getSessionAttributes();
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        var persistenceAttributes = await handlerInput.attributesManager.getPersistentAttributes()
        const deities = [requestAttributes.t('GANGA'), requestAttributes.t('SHIV'), requestAttributes.t('GANESH'), requestAttributes.t('KRISHNA'),requestAttributes.t('BALAJI'),requestAttributes.t('LAKSHMI'),requestAttributes.t('SHANI'),requestAttributes.t('SAI'),requestAttributes.t('GANPATI')];
        var d = new Date();
        var deityForToday = content.find(function(item,index){
          return item.day === d.getDay()
        }); 
        var url =  await getSignedUrl(deityForToday)
        var offset = 0
        if(handlerInput.requestEnvelope.context.Viewport == null) {
          if(persistenceAttributes.play_url){
            console.log("=============> I m resumePlayIntent audio with persistenceAttributes::" + persistenceAttributes.play_url)
            var deityName = deities[deityForToday.deity_Name]
            var metadata = {
              title: deityName,
              art: {
                sources: [{
                  url: persistenceAttributes.play_url
                }]
              }
            };
            return handlerInput.responseBuilder.addAudioPlayerPlayDirective("REPLACE_ALL", persistenceAttributes.play_url, persistenceAttributes.play_url, offset, null, metadata).withShouldEndSession(true).getResponse();
          }else{
            console.log("=============> I m resumePlayIntent audio::" + url)
            var deityName = deities[deityForToday.deity_Name]
            var metadata = {
              title: deityName,
              art: {
                sources: [{
                  url: url
                }]
              }
            };
            return handlerInput.responseBuilder.addAudioPlayerPlayDirective("REPLACE_ALL", url, url, offset, null, metadata).withShouldEndSession(true).getResponse();
          }

        }else{
            console.log("=============> I m resumePlayIntent video with session::" + sessionAttribute.url)
            if(sessionAttribute.url){
              var dataSource = {
              //dynamically populate the JSON Array below
                videoTemplateData: {
                  type: "object",
                  videoUrl: [
                      {
                        url : sessionAttribute.url
                      }
                    ]
                  }
                };
                return handlerInput.responseBuilder
                .addDirective({
                  type: 'Alexa.Presentation.APL.RenderDocument',
                  token: '[SkillProvidedToken]',
                  version: '1.0',
                  document: videoTemplate.document,
                  datasources: dataSource
                }).getResponse();

            }else{
              var dataSource = {
              //dynamically populate the JSON Array below
                videoTemplateData: {
                  type: "object",
                  videoUrl: [
                      {
                        url : url
                      }
                    ]
                  }
                };
                return handlerInput.responseBuilder
                .addDirective({
                  type: 'Alexa.Presentation.APL.RenderDocument',
                  token: '[SkillProvidedToken]',
                  version: '1.0',
                  document: videoTemplate.document,
                  datasources: dataSource
                }).getResponse();

            }

          }

  }
}


const ListIntentHandler = {
  canHandle(handlerInput){
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
    && handlerInput.requestEnvelope.request.intent.name === 'ListIntent'
  },handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    var speechText = '';   
    if(handlerInput.requestEnvelope.context.Viewport == null){
     speechText = '<speak>'+ requestAttributes.t('MORE') + '</speak>' 
     return handlerInput.responseBuilder.speak(speechText).withShouldEndSession(false).getResponse();
    }else{
      speechText = requestAttributes.t('MORE')
      if(handlerInput.requestEnvelope.request.locale === "hi-IN"){
        var apl_doc = aplTemplateFullListHindi.document
        var apl_data = aplTemplateFullListHindi.datasources
      }else {
        var apl_doc = aplTemplateFullList.document
        var apl_data = aplTemplateFullList.datasources
      }
      return handlerInput.responseBuilder.speak(speechText)
      .withShouldEndSession(false)
      .addDirective({
        type: 'Alexa.Presentation.APL.RenderDocument',
        token: '[SkillProvidedToken]',
        version: '1.0',
        document: apl_doc,
        datasources: apl_data
      }).getResponse(); 
    }      
    }
  }



const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    const speechText = requestAttributes.t('QUERY_ONE');

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .withSimpleCard(speechText)
      .getResponse();
  }
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
        || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
  },
  async handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    var speechText = `<speak>
                            <w role="amazon:NN"> ${requestAttributes.t('STOP')}</w>
                      </speak>`
    var cardText = requestAttributes.t('STOP')  
    if(handlerInput.requestEnvelope.context.Viewport == null){
     return handlerInput.responseBuilder.speak(speechText).addAudioPlayerStopDirective().withShouldEndSession(true).getResponse();
    }else{
      return handlerInput.responseBuilder.speak(speechText)
      .withShouldEndSession(true)
      .withStandardCard('Goodbye!', cardText)
      .addDirective({
        type: 'Alexa.Presentation.APL.RenderDocument',
        token: '[SkillProvidedToken]',
        version: '1.0',
        document: aplTemplateWelcome.document,
        datasources: aplTemplateWelcome.datasources
      }).getResponse(); 
    }
  }
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    // Any clean-up logic goes here.
    return handlerInput.responseBuilder.getResponse();
  }
};


const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error handled: ${error.message}`);
    console.log(`error from error handler:: ${JSON.stringify(handlerInput.requestEnvelope.request)}`);
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    var speechText = `<speak>
                            ${requestAttributes.t('ERROR_MESSAGE')}
                      </speak>`
    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .withShouldEndSession(false)
      .getResponse();
  }
};

const LocalizationInterceptor = {
  process(handlerInput) {
    // Gets the locale from the request and initializes i18next.
    const localizationClient = i18n.use(sprintf).init({
      lng: handlerInput.requestEnvelope.request.locale,
      resources: languageStrings,
    });
    // Creates a localize function to support arguments.
    localizationClient.localize = function localize() {
      // gets arguments through and passes them to
      // i18next using sprintf to replace string placeholders
      // with arguments.
      const args = arguments;
      const values = [];
      for (let i = 1; i < args.length; i += 1) {
        values.push(args[i]);
      }
      const value = i18n.t(args[0], {
        returnObjects: true,
        postProcess: 'sprintf',
        sprintf: values,
      });

      // If an array is used then a random value is selected
      if (Array.isArray(value)) {
        return value[Math.floor(Math.random() * value.length)];
      }
      return value;
    };
    // this gets the request attributes and save the localize function inside
    // it to be used in a handler by calling requestAttributes.t(STRING_ID, [args...])
    const attributes = handlerInput.attributesManager.getRequestAttributes();
    attributes.t = function translate(...args) {
      return localizationClient.localize(...args);
    };
  },
};


const BuyResponseHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'Connections.Response'
           && (handlerInput.requestEnvelope.request.name === 'Buy'
               || handlerInput.requestEnvelope.request.name === 'Upsell');
  },
  handle(handlerInput) {
    const locale = handlerInput.requestEnvelope.request.locale;
    const monetizationClient = handlerInput.serviceClientFactory.getMonetizationServiceClient();
    const productId = handlerInput.requestEnvelope.request.payload.productId;

    return monetizationClient.getInSkillProducts(locale).then((res) => {
      const product = res.inSkillProducts.filter(
        record => record.productId === productId,
      );

      if (handlerInput.requestEnvelope.request.status.code === '200') {
        let speechText;

        // check the Buy status - accepted, declined, already purchased, or something went wrong.
        switch (handlerInput.requestEnvelope.request.payload.purchaseResult) {
          case 'ACCEPTED':
            speechText = getBuyResponseText(product[0].referenceName, product[0].name);
            break;
          case 'DECLINED':
            speechText = 'No Problem.';
            break;
          case 'ALREADY_PURCHASED':
            speechText = getBuyResponseText(product[0].referenceName, product[0].name);
            break;
          default:
            speechText = `Something unexpected happened, but thanks for your interest in the ${product[0].name}.`;
            break;
        }
        // respond back to the customer
        return getResponseBasedOnAccessType(handlerInput, res, speechText);
      }
      // Request Status Code NOT 200. Something has failed with the connection.
      console.log(
        `Connections.Response indicated failure. error: + ${handlerInput.requestEnvelope.request.status.message}`,
      );
      return handlerInput.responseBuilder
        .speak('There was an error handling your purchase request. Please try again or contact us for help.')
        .getResponse();
    });
  },
};
// *****************************************
// *********** HELPER FUNCTIONS ************
// *****************************************

async function getResponseBasedOnAccessType(handlerInput, res, speechText) {
  const requestAttributes = handlerInput.attributesManager.getRequestAttributes();

  var sessionAttribute = handlerInput.attributesManager.getSessionAttributes();
  var persistenceAttributes = await handlerInput.attributesManager.getPersistentAttributes()

  const deities = [requestAttributes.t('GANGA'), requestAttributes.t('SHIV'), requestAttributes.t('GANESH'), requestAttributes.t('KRISHNA'),requestAttributes.t('BALAJI'),requestAttributes.t('LAKSHMI'),requestAttributes.t('SHANI'),requestAttributes.t('SAI'),requestAttributes.t('GANPATI')];


  const premiumSubscriptionProduct = res.inSkillProducts.filter(
    record => record.referenceName === 'Premium_Subscription_Monthly',
  );

  console.log(
    `PREMIUM SUBSCRIPTION MONTHLY PRODUCT = ${JSON.stringify(premiumSubscriptionProduct)}`,
  );
  var offset = 0

    if (isEntitled(premiumSubscriptionProduct)) {

        if(handlerInput.requestEnvelope.context.Viewport == null) {
        // return handlerInput.responseBuilder.speak(speechText).withShouldEndSession(false).getResponse();
          var speechText = `<speak>
                          <w role="amazon:NN"> ${requestAttributes.t('PLAYING',persistenceAttributes.deity_location)}</w>
                      </speak>`
          var deityName = deities[persistenceAttributes.deity_name]
          var metadata = {
            title: deityName,
            art: {
              sources: [{
                url: persistenceAttributes.play_url
              }]
            }
          };
          return handlerInput.responseBuilder.speak(speechText).addAudioPlayerPlayDirective("REPLACE_ALL", persistenceAttributes.play_url, persistenceAttributes.play_url, offset, null, metadata).withShouldEndSession(true).getResponse();

        } else {
          console.log("=============> I m yes intent::" + persistenceAttributes.play_url)
           if(handlerInput.requestEnvelope.request.locale === "hi-IN"){
            var dataSource = {
            //dynamically populate the JSON Array below
              videoTemplateData: {
                type: "object",
                videoUrl: [
                    {
                      url : "https://d3gjzbiiz7ab7p.cloudfront.net/Video_Files/new_play_hindi.mp4"
                    }
                  ]
                }
              };

            }else{

            var dataSource = {
            //dynamically populate the JSON Array below
              videoTemplateData: {
                type: "object",
                videoUrl: [
                    {
                      url : "https://d3gjzbiiz7ab7p.cloudfront.net/Video_Files/new_play_english.mp4"
                    }
                  ]
                }
              };

           }
            return handlerInput.responseBuilder
            .addDirective({
              type: 'Alexa.Presentation.APL.RenderDocument',
              token: '[SkillProvidedToken]',
              version: '1.0',
              document: videoTemplate.document,
              datasources: dataSource
            }).getResponse();

        } 

    } else {
      // Customer has not bought the Premium Subscription.
      if (shouldUpsell(handlerInput)) {
        var speechText = `<speak>
                          ${requestAttributes.t('PLAYING_SPECIFIC_WITH_ISP',persistenceAttributes.deity_location)} 
                          <audio src= "https://alexamediacontents.s3.amazonaws.com/Audio_Files/file_example_MP3_700KB.mp3" />
                         </speak>`
        return makeUpsell(speechText, premiumSubscriptionProduct, handlerInput);
      }
      return handlerInput.responseBuilder.speak(speechText).getResponse();
    }

}


function makeUpsell(preUpsellMessage, premiumSubscriptionProduct, handlerInput) {
  const upsellMessage = `${preUpsellMessage}. ${premiumSubscriptionProduct[0].summary}. ${getRandomLearnMorePrompt()}`;

  return handlerInput.responseBuilder
    .addDirective({
      type: 'Connections.SendRequest',
      name: 'Upsell',
      payload: {
        InSkillProduct: {
          productId: premiumSubscriptionProduct[0].productId,
        },
        upsellMessage,
      },
      token: 'correlationToken',
    })
    .getResponse();
}

function getRandomLearnMorePrompt() {
  const questions = [
    'Want to learn more about it?',
    'Should I tell you more about it?',
    'Want to learn about it?',
    'Interested in learning more about it?',
  ];
  return randomize(questions);
}

function randomize(array) {
  const randomItem = array[Math.floor(Math.random() * array.length)];
  return randomItem;
}

function isProduct(product) {
  return product && product.length > 0;
}
function isEntitled(product) {
  return isProduct(product) && product[0].entitled === 'ENTITLED';
}

function shouldUpsell(handlerInput) {
  if (handlerInput.requestEnvelope.request.intent === undefined) {
    // If the last intent was Connections.Response, do not upsell
    return false;
  }

  return randomize([true, false]); // randomize upsell
}

function getBuyResponseText(productReferenceName, productName) {
  if (productReferenceName === 'Premium_Subscription') {
    return `With the ${productName}, I can now have access to various live darshan from various temples.`;
  }

  console.log('Product Undefined');
  return 'Sorry, that\'s not a valid product';
}







const skillBuilder = Alexa.SkillBuilders.standard();

exports.handler = skillBuilder
  .addRequestHandlers(
        LaunchRequestHandler,
        HelpIntentHandler,
        YesNoIntentHandler,
        PauseIntentHandler,
        ResumeIntentHandler,
        AskToPlayIntentHandler,
        ListIntentHandler,
        VideoEndedEventHandler,
        AudioPlayerIntentHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler,
        BuyResponseHandler
  )
  .addRequestInterceptors(LocalizationInterceptor)
  .addErrorHandlers(ErrorHandler).withTableName('alexastorage_us').withAutoCreateTable(true).lambda()
