/* Mightora REST Studio – optional model-driven app command-bar action.
 * Create a separate JavaScript web resource with this file and update
 * WEB_RESOURCE_NAME to the actual publisher-prefixed HTML resource name.
 */
var MightoraRestStudio=(function(){
  'use strict';
  var WEB_RESOURCE_NAME='REPLACE_WITH_PUBLISHER_rest.html';
  function open(){
    if(!window.Xrm||!Xrm.Navigation||!Xrm.Navigation.navigateTo)
      return Promise.reject(new Error('Open this command inside a model-driven Power App.'));
    if(WEB_RESOURCE_NAME.indexOf('REPLACE_WITH')===0)
      return Promise.reject(new Error('Set WEB_RESOURCE_NAME to your publisher-prefixed HTML web resource name.'));
    return Xrm.Navigation.navigateTo(
      {pageType:'webresource',webresourceName:WEB_RESOURCE_NAME},
      {target:2,position:1,width:{value:88,unit:'%'},height:{value:85,unit:'%'},title:'Mightora REST Studio'}
    );
  }
  return {open:open};
}());
