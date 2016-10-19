import {Observable} from 'rxjs/Observable';

import 'rxjs/add/observable/timer';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/switch';

const newCoolOperators = {
  guaranteedThrottle: function (time, scheduler=null) {
    return this
      .map((x) => Observable.timer(time, scheduler).map(() => x))
      .switch();
  }
};

for (let key of Object.keys(newCoolOperators)) {
  Observable.prototype[key] = newCoolOperators[key];
}
