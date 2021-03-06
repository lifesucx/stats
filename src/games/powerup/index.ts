import { autoinject } from "aurelia-framework";
import { PLATFORM } from "aurelia-pal";
import * as naturalSort from "javascript-natural-sort";

import { IGame, gameManager } from "../index";
import { validateEventTeamMatches, getTeamNumbers } from "../merge-utils";
import { Match2018MergeDialog } from "./merge-dialog";
import { Match2018MergeState, PowerupEventJson } from "./model";
import { FrcStatsContext, EventMatchEntity } from "../../persistence";
import { JsonExporter } from "./event-to-json";

@autoinject
class PowerupGame implements IGame {
  public gameCode = "2018";
  public year = "2018";
  public name = "FIRST POWER UP";
  public matchInputModule = PLATFORM.moduleName("games/powerup/match-input");
  public eventTeamsModule = PLATFORM.moduleName("games/powerup/event-teams");
  public eventTeamModule = PLATFORM.moduleName("games/powerup/event-team");

  constructor(
    private dbContext: FrcStatsContext,
    private jsonExporter: JsonExporter) {
  }

  mergeDialogClass() {
    return Match2018MergeDialog;
  }

  exportEventJson(event): Promise<PowerupEventJson> {
    return this.jsonExporter.eventToJson(event);
  }

  setJsonEventTeamMatch(json: any, match) {
    json['matches2018'] = [match];
  }

  getEventTeamMatches(eventCode) {
    return this.dbContext.getTeamMatches2018({ eventCode: eventCode }).then(matches => {
      matches.sort((a, b) => naturalSort(a.matchNumber, b.matchNumber));
      return matches;
    });
  }

  clearIds(json: PowerupEventJson) {
    json.matches2018.forEach(x => delete x.id);
  }

  beginMerge(json: PowerupEventJson): Promise<Match2018MergeState[]> {
    if (json.event.year != this.gameCode) {
      throw new Error("invalid json mergement");
    }
    let matches2018Merge = [];
    return this.dbContext.getTeamMatches2018({ eventCode: json.event.eventCode })
      .then((fromDbMatches2018) => {
        ;
        fromDbMatches2018.forEach(match2018 => {
          let state = Match2018MergeState.makeFromDb(match2018);
          state.localSaved = match2018;
          matches2018Merge.push(state);
        });

        json.matches2018.forEach(match2018 => {
          let states = matches2018Merge.filter(a => a.matchNumber == match2018.matchNumber && a.teamNumber == match2018.teamNumber);
          if (states.length != 0) {
            let state = states[0];
            state.fromFile = match2018;
          } else {
            let state = Match2018MergeState.makeFromFile(match2018);
            matches2018Merge.push(state);
          }
        });

        for (var state of matches2018Merge) {
          state.setSameness();
        }

        matches2018Merge.sort((a, b) => naturalSort(a.matchNumber, b.matchNumber));
        return matches2018Merge;
      });
  }

  completeMerge(matches2018Merge: Match2018MergeState[]): Promise<any> {
    let noop = Promise.resolve("yup");
    return Promise.all(
      matches2018Merge.map(state => {
        if (!state.resolved) {
          console.error("item not resolved", state);
          throw new Error("item not resolved");
        }
        if (state.same || state.takeLocal) {
          return noop;
        } else if (state.takeFromFile) {
          // add record from file
          return this.dbContext.teamMatches2018.put(state.fromFile)
            .then(() => noop); //shaddap typescript
        } else if (!state.takeLocal && !state.takeFromFile && state.localSaved != null && state.fromFile == null) {
          // delete record from db
          return this.dbContext.teamMatches2018.delete(state.localSaved.id).then(() => noop);
        } else if (state.merged != null) {
          state.merged.id = state.localSaved.id;
          return this.dbContext.teamMatches2018.put(state.merged).then(() => noop);
        } else {
          throw new Error("crumb! we missed a case!");
        }
      }));
  }

  getTables() {
    return [this.dbContext.teamMatches2018];
  }

  importSimple(json: PowerupEventJson): Promise<any> {
    return this.dbContext.teamMatches2018.bulkPut(json.matches2018);
  }

  deleteEvent(json: PowerupEventJson): Promise<any> {
    return this.dbContext.getTeamMatches2018({ eventCode: json.event.eventCode })
      .then(localMatches => {
        return this.dbContext.teamMatches2018.bulkDelete(localMatches.map(x => x.id));
      });
  }

  validateEventTeamMatches(json: any) {
    return validateEventTeamMatches(json, json.matches2018, "matches2018");
  }

  updateMatch(matchP: EventMatchEntity, oldMatchNumber: string) {
    let teamNumbers = getTeamNumbers(matchP);
    return this.dbContext.getTeamMatches2018({ eventCode: matchP.eventCode, matchNumber: oldMatchNumber })
      .then(matches => {
        let saveMatches = [];
        let deleteMatches = [];
        for (var match of matches) {
          if (!teamNumbers.has(match.teamNumber)) {
            deleteMatches.push(match.id);
          } else if (oldMatchNumber != matchP.matchNumber) {
            match.matchNumber = matchP.matchNumber;
            saveMatches.push(match);
          }
        }

        return Promise.all([
          this.dbContext.teamMatches2018.bulkPut(saveMatches),
          this.dbContext.teamMatches2018.bulkDelete(deleteMatches),
        ]);
      }).then(() => "yup");
  }

  deleteMatch(eventCode: string, oldMatchNumber: string): Promise<any> {
    return this.dbContext.getTeamMatches2018({ eventCode: eventCode, matchNumber: oldMatchNumber })
      .then(matches => {
        let deleteMatches = matches.map(m => m.id)

        return this.dbContext.teamMatches2018.bulkDelete(deleteMatches);
      }).then(() => "yup");
  }

  deleteTeamMatch(eventCode: string, oldMatchNumber: string, teamNumber: string): Promise<any> {
    return this.dbContext.getTeamMatches2018({
      eventCode: eventCode,
      matchNumber: oldMatchNumber,
      teamNumber: teamNumber
    }).then(matches => {
      let deleteMatches = matches.map(m => m.id)

      return this.dbContext.teamMatches2018.bulkDelete(deleteMatches);
    }).then(() => "yup");
  }
}

export function configure(config) {
  var game = config.container.get(PowerupGame);
  gameManager.registerGame(game);
}
