import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MainComponent } from './main/main.component';
import { SanitizeUrlModule } from './sanitizeurl/sanitizeurl.module';

@NgModule({
  declarations: [
      AppComponent,
      MainComponent
  ],
    imports: [
        BrowserModule,
        AppRoutingModule,
        SanitizeUrlModule
    ],
    providers: [],
    bootstrap: [AppComponent]
})
export class AppModule { }
