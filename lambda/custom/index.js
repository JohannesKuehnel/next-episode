'use strict';

const Alexa = require('ask-sdk-core');
const i18n = require('i18next');
const fetch = require('node-fetch');
const Promise = require('bluebird');
const moment = require('moment');

const languageStrings = require('./languageStrings');

const REST_BASE = "https://api.tvmaze.com/";
const REST_SEARCH = (query) => REST_BASE + `singlesearch/shows?q=${query}`;

const GET_OPTIONS = {
  method: 'GET',
  timeout: 5000
};

const checkResponse = function (res) {
  return new Promise(function (resolve, reject) {
    console.log("Data fetched. Processing...");
    if (res.ok) {
      resolve(res.json());
    } else {
      try {
        resolve(res.text());
      } catch (err) {
        reject('Network response was not ok.');
      }
    }
  });
};

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    const speakOutput = handlerInput.t('PROMPT_NAME');
    const speakOutputReprompt = handlerInput.t('REPROMPT_NAME');

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutputReprompt)
      .getResponse();
  }
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speakOutput = handlerInput.t('HELP') + " " + handlerInput.t('PROMPT_NAME');
    const speakOutputReprompt = handlerInput.t('REPROMPT_NAME');

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutputReprompt)
      .getResponse();
  }
};

const QuestionIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'QuestionIntent';
  },
  async handle(handlerInput) {
    let speakOutput;
    try {
      moment.locale(Alexa.getLocale(handlerInput.requestEnvelope));
      let series_name = null;
      console.log("Next Episode Handler ...");
      let name = handlerInput.requestEnvelope.request.intent.slots.Series;
      if (!name || !name.value) {
        return handlerInput.responseBuilder
          .speak(handlerInput.t('PROMPT_NAME'))
          .reprompt(handlerInput.t('REPROMPT_NAME'))
          .getResponse();
      }
      name = name.value;
      console.log("Query: " + name);
      let response = await fetch(REST_SEARCH(name), GET_OPTIONS);
      let series = await checkResponse(response);
      console.log("Data processed. Building answer...");
      if (!series)
        return handlerInput.responseBuilder
          .speak(handlerInput.t('NOT_FOUND'))
          .getResponse();

      series_name = series.name;
      if (series.status == "Ended") {
        return handlerInput.responseBuilder
          .speak(series_name + handlerInput.t('SHOW_ENDED'))
          .getResponse();
      }

      if (series._links && series._links.nextepisode && series._links.nextepisode.href)
        response = await fetch(series._links.nextepisode.href, GET_OPTIONS);
      else
        return handlerInput.responseBuilder
          .speak(handlerInput.t('NO_INFO') + series_name)
          .getResponse();
      const episode = await checkResponse(response);
      console.log(moment(episode.airstamp).format('DD.MM.YYYY hh:mm'));
      let output = "";
      if (episode.season && episode.number)
        output += handlerInput.t('SEASON') + episode.season + " ";
      if (episode.number)
        output += handlerInput.t('EPISODE') + episode.number;
      else
        output += handlerInput.t('NEXT_EPISODE');
      output += handlerInput.t('OF') + series_name + handlerInput.t('STARTS') + moment(episode.airstamp).fromNow();
      console.log(output);
      return handlerInput.responseBuilder
        .speak(output)
        .withSimpleCard(handlerInput.t('SKILL_NAME'), output)
        .getResponse();
    } catch(error) {
      console.log(error);
      if (error.name && error.message)
        speakOutput = error.message;
      else
        speakOutput = error;
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .withSimpleCard(handlerInput.t('SKILL_NAME'), speakOutput)
        .getResponse();
    }
  }
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
          || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    const speakOutput = handlerInput.t('STOP_MESSAGE');

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .getResponse();
  }
};

const SessionEndedRequest = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);

    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    const speakOutput = handlerInput.t('ERROR_MSG');
    console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  }
};

const LocalisationRequestInterceptor = {
  process(handlerInput) {
    i18n.init({
      lng: Alexa.getLocale(handlerInput.requestEnvelope),
      resources: languageStrings
    }).then((t) => {
      handlerInput.t = (...args) => t(...args);
    });
  }
};

exports.handler = Alexa.SkillBuilders.custom()
  .withSkillId(process.env.SKILL_ID)
  .addRequestHandlers(
    LaunchRequestHandler,
    HelpIntentHandler,
    QuestionIntentHandler,
    SessionEndedRequest,
    CancelAndStopIntentHandler)
  .addErrorHandlers(
    ErrorHandler)
  .addRequestInterceptors(
    LocalisationRequestInterceptor)
  .withCustomUserAgent('next-episode/v2.0')
  .lambda();
